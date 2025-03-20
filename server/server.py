import os
import socket
import json
import threading
import hashlib
import base64
import ssl

# Server configuration
HOST = '0.0.0.0'  # Listen on all available network interfaces
PORT = 8080       # Choose a port that's likely to be open on firewalls

# Get absolute path for music directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
MUSIC_DIR = os.path.join(PROJECT_DIR, 'music')  # Directory containing audio files

# Simple user database - in production, use a proper database
USERS = {
    "user1": hashlib.sha256("password1".encode()).hexdigest(),
    "user2": hashlib.sha256("password2".encode()).hexdigest()
}

# Create a list of available songs
def get_song_list():
    # Create music directory if it doesn't exist
    if not os.path.exists(MUSIC_DIR):
        os.makedirs(MUSIC_DIR)
        print(f"Created music directory at: {MUSIC_DIR}")
        print("Please add MP3 files to this directory.")
    
    songs = [f for f in os.listdir(MUSIC_DIR) if f.endswith('.mp3')]
    print(f"Available songs: {songs}")
    return songs

def authenticate(conn):
    """Authenticate a user"""
    conn.send("AUTH_REQUIRED".encode())
    auth_data = conn.recv(1024).decode().split(":")
    
    if len(auth_data) != 2:
        return False
        
    username, password = auth_data
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    if username in USERS and USERS[username] == password_hash:
        conn.send("AUTH_SUCCESS".encode())
        return True
    else:
        conn.send("AUTH_FAILED".encode())
        return False

# Handle client requests
def handle_client(conn, addr):
    print(f"Connected to {addr}")
    try:
        # Authenticate the client
        if not authenticate(conn):
            print(f"Authentication failed for {addr}")
            return

        # Send the list of available songs to the client
        songs = get_song_list()
        conn.send(json.dumps(songs).encode())

        # Receive the selected song from the client
        song_name = conn.recv(1024).decode()
        if not song_name or song_name not in songs:
            conn.send("Song not found".encode())
            return

        # Stream the selected song
        song_path = os.path.join(MUSIC_DIR, song_name)
        file_size = os.path.getsize(song_path)
        print(f"Streaming {song_name} ({file_size} bytes) to {addr}")
        
        with open(song_path, 'rb') as song_file:
            # Send the file in chunks
            chunk_size = 4096  # Larger chunk size
            bytes_sent = 0
            while True:
                data = song_file.read(chunk_size)
                if not data:
                    break
                conn.send(data)
                bytes_sent += len(data)
                print(f"Sent {bytes_sent}/{file_size} bytes ({bytes_sent/file_size*100:.1f}%)", end='\r')
        
        print(f"\nFinished streaming {song_name} to {addr}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

# Start the server
def start_server():
    # Create SSL context
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(certfile="server.crt", keyfile="server.key")
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((HOST, PORT))
        server_socket.listen(5)
        print(f"Server listening on {HOST}:{PORT}")
        
        # Wrap the socket with SSL
        with context.wrap_socket(server_socket, server_side=True) as ssl_socket:
            while True:
                try:
                    conn, addr = ssl_socket.accept()
                    client_thread = threading.Thread(target=handle_client, args=(conn, addr))
                    client_thread.daemon = True
                    client_thread.start()
                except KeyboardInterrupt:
                    print("\nServer shutting down...")
                    break
                except Exception as e:
                    print(f"Error accepting connection: {e}")

if __name__ == "__main__":
    try:
        print(f"ByteBeats Music Server starting...")
        print(f"Music directory: {MUSIC_DIR}")
        start_server()
    except KeyboardInterrupt:
        print("\nServer terminated by user")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Server shutdown complete")