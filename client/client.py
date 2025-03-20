import socket
import json
import os
import tempfile
import subprocess
import threading
import time
import sys
import signal
import ssl

# Server configuration
HOST = input("Enter server IP or hostname: ")  # Allow user to input server address
PORT = 8080  # Must match the server port

# Global variables for playback control
player_process = None
is_playing = False
is_paused = False
current_song = None
stop_playback = False

# Connect to the server
def connect_to_server():
    # Create SSL context
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # In production, use CERT_REQUIRED
    
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    ssl_socket = context.wrap_socket(client_socket, server_hostname=HOST)
    ssl_socket.connect((HOST, PORT))
    
    # Handle authentication
    auth_response = ssl_socket.recv(1024).decode()
    if auth_response == "AUTH_REQUIRED":
        username = input("Username: ")
        password = input("Password: ")
        ssl_socket.send(f"{username}:{password}".encode())
        
        result = ssl_socket.recv(1024).decode()
        if result == "AUTH_FAILED":
            raise Exception("Authentication failed")
    
    print("Connected to server")
    return ssl_socket

# Get the list of available songs
def get_song_list(client_socket):
    songs_data = client_socket.recv(4096).decode()  # Increased buffer size
    songs = json.loads(songs_data)
    return songs

# Toggle pause/resume playback
def toggle_pause():
    global player_process, is_paused
    
    if not player_process or player_process.poll() is not None:
        return
    
    if os.name == 'posix':  # macOS or Linux
        if not is_paused:
            # Pause playback by sending SIGSTOP
            os.kill(player_process.pid, signal.SIGSTOP)
            is_paused = True
            print("\nPlayback paused. Press 'p' to resume.")
        else:
            # Resume playback by sending SIGCONT
            os.kill(player_process.pid, signal.SIGCONT)
            is_paused = False
            print("\nPlayback resumed.")
    else:
        print("Pause/Resume not supported on this platform")

# Play the MP3 file in a separate thread
def play_music(temp_filename, song_name):
    global is_playing, player_process, stop_playback, is_paused
    
    is_playing = True
    is_paused = False
    print(f"\nNow playing: {song_name}")
    print("Playback controls:")
    print("  p - pause/resume")
    print("  s - stop and return to song selection")
    print("  q - quit application")
    
    try:
        if os.name == 'posix':  # macOS or Linux
            # For macOS, use afplay
            player_process = subprocess.Popen(['afplay', temp_filename])
            
            # Monitor the player process
            while player_process.poll() is None and not stop_playback:
                time.sleep(0.1)
                
            if not stop_playback and player_process.returncode == 0:
                print(f"\nFinished playing {song_name}")
            
        else:  # Windows
            # For Windows, use the default player
            os.startfile(temp_filename)
            # Since we can't easily control the default player, wait for user input
            input("Press Enter to stop playback...")
    except Exception as e:
        print(f"Error playing audio: {e}")
    finally:
        is_playing = False
        is_paused = False
        player_process = None

# Handle playback controls
def handle_controls():
    global is_playing, player_process, stop_playback
    
    while is_playing and not stop_playback:
        if sys.stdin.isatty():  # Only if running in interactive terminal
            try:
                # Use non-blocking input if possible
                import select
                if select.select([sys.stdin], [], [], 0.1)[0]:
                    command = sys.stdin.readline().strip().lower()
                    
                    if command == 'p':  # Pause/Resume
                        toggle_pause()
                            
                    elif command == 's':  # Stop
                        if player_process and player_process.poll() is None:
                            player_process.terminate()
                            print("\nStopping playback...")
                            stop_playback = True
                            
                    elif command == 'q':  # Quit
                        if player_process and player_process.poll() is None:
                            player_process.terminate()
                        print("\nExiting application...")
                        sys.exit(0)
            except (ImportError, Exception) as e:
                # Fall back to blocking input
                command = input().strip().lower()
                if command == 'p':
                    toggle_pause()
                elif command == 's':
                    if player_process and player_process.poll() is None:
                        player_process.terminate()
                    stop_playback = True
                elif command == 'q':
                    if player_process and player_process.poll() is None:
                        player_process.terminate()
                    sys.exit(0)
        else:
            time.sleep(0.1)

# Stream and play the selected song
def stream_song(client_socket, song_name):
    global stop_playback
    
    client_socket.send(song_name.encode())
    stop_playback = False

    # Create buffer for smoother playback
    buffer_size = 1024 * 1024  # 1MB buffer
    audio_buffer = b''
    
    # Create a temporary file to store the MP3
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
    temp_filename = temp_file.name
    
    # Start buffering in a separate thread
    def buffer_stream():
        nonlocal audio_buffer
        while True:
            chunk = client_socket.recv(8192)  # Larger chunk for network
            if not chunk:
                break
            audio_buffer += chunk
            temp_file.write(chunk)
            
    buffer_thread = threading.Thread(target=buffer_stream)
    buffer_thread.daemon = True
    buffer_thread.start()
    
    # Wait for initial buffer to fill
    print("Buffering...", end='')
    while len(audio_buffer) < buffer_size and buffer_thread.is_alive():
        print(".", end='')
        time.sleep(0.5)
    print("\nStarting playback!")
    
    # Start playback in a separate thread
    playback_thread = threading.Thread(target=play_music, args=(temp_filename, song_name))
    playback_thread.daemon = True
    playback_thread.start()
    
    # Handle controls in the main thread
    handle_controls()
    
    # Wait for playback to finish
    playback_thread.join()
    
    try:
        bytes_received = 0
        while True:
            chunk = client_socket.recv(4096)  # Increased buffer size
            if not chunk:
                break
            temp_file.write(chunk)
            bytes_received += len(chunk)
            print(f"Received {bytes_received} bytes", end='\r')
        
        temp_file.close()
        print(f"\nDownloaded {bytes_received} bytes of audio data")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Clean up the temporary file
        try:
            os.unlink(temp_filename)
        except:
            pass

# Main function
def main():
    try:
        print("Welcome to ByteBeats Music Player")
        print("----------------------------------")
        
        while True:
            try:
                client_socket = connect_to_server()
        
                # Get the list of available songs
                songs = get_song_list(client_socket)
                if not songs:
                    print("No songs available on the server. Please add MP3 files to the music directory.")
                    client_socket.close()
                    input("Press Enter to try again...")
                    continue
                    
                print("\nAvailable songs:")
                for i, song in enumerate(songs):
                    print(f"{i + 1}. {song}")
                print("q. Quit application")
        
                # Select a song
                choice = input("\nSelect a song by number (or 'q' to quit): ")
                if choice.lower() == 'q':
                    break
                    
                try:
                    choice = int(choice) - 1
                    if 0 <= choice < len(songs):
                        song_name = songs[choice]
                        print(f"Streaming {song_name}...")
                        stream_song(client_socket, song_name)
                    else:
                        print("Invalid choice")
                except ValueError:
                    print("Please enter a valid number or 'q'")
                    
                client_socket.close()
                
            except ConnectionRefusedError:
                print("Error: Could not connect to the server. Make sure the server is running.")
                retry = input("Try again? (y/n): ")
                if retry.lower() != 'y':
                    break
            except Exception as e:
                print(f"Error: {e}")
                retry = input("Try again? (y/n): ")
                if retry.lower() != 'y':
                    break
            
    except KeyboardInterrupt:
        print("\nApplication terminated by user")
    finally:
        if 'client_socket' in locals() and client_socket:
            client_socket.close()
        print("Goodbye!")

if __name__ == "__main__":
    main()