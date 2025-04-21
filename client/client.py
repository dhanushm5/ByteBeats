import socket
import json
import os
import tempfile
import subprocess
import threading
import time
import sys
import signal
import websocket
import struct

# Server configuration
HOST = input("Enter server IP address on the mobile hotspot: ")  # Allow user to input server address
PORT = 8080  # Must match the server port

# Global variables for playback control
player_process = None
is_playing = False
is_paused = False
current_song = None
stop_playback = False

# Connect to the server
def connect_to_server():
    # Create a WebSocket connection without SSL
    ws_url = f"ws://{HOST}:{PORT}"
    print(f"Connecting to {ws_url}...")
    
    # Use the websocket-client library for better WebSocket support
    try:
        client_socket = websocket.create_connection(ws_url)
        print("Connected to server")
        return client_socket
    except Exception as e:
        print(f"Connection failed: {e}")
        raise

# Get the list of available songs
def get_song_list(client_socket):
    # Wait for the AUTH_REQUIRED message
    try:
        message = client_socket.recv()
        data = json.loads(message)
        if data.get("type") == "AUTH_REQUIRED":
            username = input("Username: ")
            password = input("Password: ")
            client_socket.send(f"{username}:{password}")
            
            # Wait for authentication result
            auth_result = client_socket.recv()
            auth_data = json.loads(auth_result)
            if auth_data.get("type") == "AUTH_FAILED":
                raise Exception("Authentication failed")
            elif auth_data.get("type") == "AUTH_SUCCESS":
                print("Authentication successful")
                return auth_data.get("songs", [])
        else:
            print(f"Unexpected message: {data}")
            return []
    except json.JSONDecodeError:
        print(f"Error parsing server response")
        return []
    except Exception as e:
        print(f"Error: {e}")
        return []

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

# Decode a WebSocket frame (needed for binary data)
def parse_websocket_message(ws, binary=False):
    try:
        opcode, data = ws.recv_data()
        return data
    except Exception as e:
        print(f"Error parsing WebSocket message: {e}")
        return None

# Stream and play the selected song
def stream_song(client_socket, song_name):
    global stop_playback
    
    # Send a play request as JSON
    play_request = json.dumps({
        "type": "PLAY_SONG",
        "name": song_name
    })
    client_socket.send(play_request)
    stop_playback = False

    # Create a temporary file to store the MP3
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
    temp_filename = temp_file.name
    
    # Variables to track download progress
    bytes_received = 0
    song_size = None
    receiving_data = False
    
    try:
        print("Waiting for song data...")
        while True:
            # Receive WebSocket message
            message = client_socket.recv()
            
            # If it's binary data (likely audio chunks)
            if isinstance(message, bytes):
                temp_file.write(message)
                bytes_received += len(message)
                if song_size:
                    progress = (bytes_received / song_size) * 100
                    print(f"Received: {bytes_received / (1024*1024):.2f} MB ({progress:.1f}%)", end='\r')
                else:
                    print(f"Received: {bytes_received / 1024:.0f} KB", end='\r')
                continue
                
            # Try to parse as JSON for control messages
            try:
                data = json.loads(message)
                message_type = data.get("type")
                
                if message_type == "SONG_METADATA":
                    song_size = data.get("size", 0)
                    print(f"\nSong: {data.get('name')}, Size: {song_size / (1024*1024):.2f} MB")
                
                elif message_type == "SONG_PLAYING":
                    print(f"Server started streaming: {data.get('name')}")
                    receiving_data = True
                
                elif message_type == "SONG_ENDED":
                    print(f"\nFinished receiving song data: {bytes_received} bytes")
                    receiving_data = False
                    temp_file.close()
                    
                    # Start playback in a separate thread
                    playback_thread = threading.Thread(target=play_music, args=(temp_filename, song_name))
                    playback_thread.daemon = True
                    playback_thread.start()
                    
                    # Handle controls in the main thread
                    handle_controls()
                    
                    # Wait for playback to finish
                    playback_thread.join()
                    return
                    
                elif message_type == "STREAM_ERROR":
                    print(f"\nError streaming song: {data.get('error')}")
                    return
            
            except json.JSONDecodeError:
                print(f"Received non-JSON message: {message[:50]}...")
    
    except Exception as e:
        print(f"\nError during streaming: {e}")
    finally:
        # Clean up the temporary file
        try:
            if os.path.exists(temp_filename):
                os.unlink(temp_filename)
        except:
            pass

# Main function
def main():
    try:
        print("Welcome to ByteBeats Music Player")
        print("----------------------------------")
        print("To connect devices over a mobile hotspot:")
        print("1. Make sure both devices are connected to the same mobile hotspot")
        print("2. Find the server's IP address on the mobile hotspot network")
        print("3. Enter that IP address when prompted below")
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