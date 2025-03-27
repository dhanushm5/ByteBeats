import os
import socket
import json
import threading
import hashlib
import base64
import ssl
import http.server
import struct
from uuid import uuid4

# Add this import
import re
import time

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

# WebSocket constants
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

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

def handle_websocket_handshake(conn, data):
    """Handle the WebSocket handshake protocol"""
    try:
        # Parse the WebSocket handshake request
        key_match = re.search(r'Sec-WebSocket-Key: (.*)\r\n', data)
        if not key_match:
            print("WebSocket key not found in request")
            return False
            
        websocket_key = key_match.group(1).strip()
        print(f"WebSocket key: {websocket_key}")
        
        # Calculate the WebSocket accept key
        accept_key = base64.b64encode(
            hashlib.sha1((websocket_key + GUID).encode()).digest()
        ).decode()
        
        # Send the WebSocket handshake response
        handshake_response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
        )
        
        conn.send(handshake_response.encode())
        print("WebSocket handshake completed")
        return True
    except Exception as e:
        print(f"WebSocket handshake error: {e}")
        return False

def decode_websocket_frame(data):
    """Decode a WebSocket frame"""
    try:
        if len(data) < 6:
            return None
            
        # Parse first byte (FIN, RSV1-3, Opcode)
        first_byte = data[0]
        fin = (first_byte & 0x80) != 0
        opcode = first_byte & 0x0F
        
        # Parse second byte (MASK, Payload length)
        second_byte = data[1]
        is_masked = (second_byte & 0x80) != 0
        payload_length = second_byte & 0x7F
        
        # Determine payload length
        payload_start = 2
        if payload_length == 126:
            payload_length = struct.unpack(">H", data[2:4])[0]
            payload_start = 4
        elif payload_length == 127:
            payload_length = struct.unpack(">Q", data[2:10])[0]
            payload_start = 10
            
        # Get masking key and payload
        if is_masked:
            mask_key = data[payload_start:payload_start+4]
            payload_start += 4
            
            payload = bytearray(data[payload_start:payload_start+payload_length])
            for i in range(len(payload)):
                payload[i] ^= mask_key[i % 4]
                
            return payload.decode()
        else:
            return data[payload_start:payload_start+payload_length].decode()
    except Exception as e:
        print(f"Error decoding WebSocket frame: {e}")
        return None

def encode_websocket_frame(message, opcode=0x01):
    """Encode a message as a WebSocket frame"""
    if isinstance(message, str):
        message = message.encode()
        
    # First byte: FIN bit (1) + reserved bits (000) + opcode (4 bits)
    first_byte = 0x80 | opcode  # 0x01 for text, 0x02 for binary
    
    # Second byte: MASK bit (0) + payload length (7 bits)
    length = len(message)
    if length < 126:
        frame = bytes([first_byte, length])
    elif length < 65536:
        frame = bytes([first_byte, 126]) + struct.pack(">H", length)
    else:
        frame = bytes([first_byte, 127]) + struct.pack(">Q", length)
        
    # Append payload
    frame += message
    return frame

def send_websocket_message(conn, message):
    """Send a message over WebSocket"""
    try:
        if isinstance(message, dict):
            message = json.dumps(message)
        frame = encode_websocket_frame(message)
        conn.send(frame)
        return True
    except Exception as e:
        print(f"Error sending WebSocket message: {e}")
        return False

def authenticate(conn, username, password):
    """Authenticate a user"""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    if username in USERS and USERS[username] == password_hash:
        print(f"Authentication successful for user: {username}")
        return True
    else:
        print(f"Authentication failed for user: {username}")
        return False

# Add this function to stream song data in chunks
def stream_song(conn, song_name):
    """Stream a song over the WebSocket connection"""
    try:
        song_path = os.path.join(MUSIC_DIR, song_name)
        # First, send audio metadata
        file_size = os.path.getsize(song_path)
        metadata = {
            "type": "SONG_METADATA",
            "name": song_name,
            "size": file_size
        }
        send_websocket_message(conn, metadata)
        print(f"Sending song: {song_name}, size: {file_size} bytes")
        
        # Stream the file in chunks
        chunk_size = 32768  # 32KB chunks
        total_sent = 0
        with open(song_path, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                
                # Use binary opcode (0x02) for audio data
                frame = encode_websocket_frame(chunk, opcode=0x02)
                conn.send(frame)
                total_sent += len(chunk)
                
                # Log progress for larger files
                if total_sent % (chunk_size * 10) == 0:  # Log every ~320KB
                    print(f"Sent {total_sent / (1024 * 1024):.2f} MB of {file_size / (1024 * 1024):.2f} MB")
                
                # Small delay to prevent overwhelming the connection
                time.sleep(0.01)
        
        # Send end of stream message
        send_websocket_message(conn, {"type": "SONG_ENDED"})
        print(f"Finished sending song: {song_name}, total: {total_sent} bytes")
        return True
    except Exception as e:
        print(f"Error streaming song: {e}")
        send_websocket_message(conn, {"type": "STREAM_ERROR", "error": str(e)})
        return False

# Handle client requests
def handle_client(conn, addr):
    print(f"Connected to {addr}")
    try:
        # Receive initial data
        data = conn.recv(1024).decode()
        
        # Check if this is a WebSocket handshake request
        if "Upgrade: websocket" in data:
            if not handle_websocket_handshake(conn, data):
                print("WebSocket handshake failed")
                return
                
            # WebSocket connection established
            is_authenticated = False
            
            # Send authentication required message
            send_websocket_message(conn, {"type": "AUTH_REQUIRED"})
            
            # WebSocket communication loop
            while True:
                try:
                    # Receive message frame
                    frame_data = conn.recv(1024)
                    if not frame_data:
                        print("Client disconnected")
                        break
                        
                    # Decode the WebSocket frame
                    message = decode_websocket_frame(frame_data)
                    if not message:
                        continue
                        
                    print(f"Received WebSocket message: {message}")
                    
                    # Handle message based on authentication state
                    if not is_authenticated:
                        # Try to authenticate
                        try:
                            auth_parts = message.split(":")
                            if len(auth_parts) == 2:
                                username, password = auth_parts
                                if authenticate(conn, username, password):
                                    is_authenticated = True
                                    # Send authentication success and song list
                                    songs = get_song_list()
                                    send_websocket_message(conn, {
                                        "type": "AUTH_SUCCESS",
                                        "songs": songs
                                    })
                                else:
                                    send_websocket_message(conn, {"type": "AUTH_FAILED"})
                            else:
                                send_websocket_message(conn, {"type": "AUTH_FAILED"})
                        except Exception as e:
                            print(f"Authentication error: {e}")
                            send_websocket_message(conn, {"type": "AUTH_FAILED"})
                    else:
                        # Handle authenticated requests
                        try:
                            request = json.loads(message)
                            if request.get("type") == "PLAY_SONG":
                                song_name = request.get("name")
                                songs = get_song_list()
                                
                                if song_name in songs:
                                    # Acknowledge the song request
                                    send_websocket_message(conn, {
                                        "type": "SONG_PLAYING",
                                        "name": song_name
                                    })
                                    
                                    # Stream the song
                                    print(f"Playing song: {song_name}")
                                    stream_song(conn, song_name)
                                else:
                                    send_websocket_message(conn, {"type": "SONG_NOT_FOUND"})
                            elif request.get("type") == "GET_SONGS":
                                songs = get_song_list()
                                send_websocket_message(conn, {
                                    "type": "SONG_LIST",
                                    "songs": songs
                                })
                            # Update this section in the handle_client function to handle PAUSE and RESUME:
                            elif request.get("type") == "PAUSE":
                                print("Received pause command")
                                # You might implement additional server-side pause handling here
                                # For now, we just acknowledge the command
                                send_websocket_message(conn, {"type": "PAUSED"})
                                
                            elif request.get("type") == "RESUME":
                                print("Received resume command")
                                # You might implement additional server-side resume handling here
                                # For now, we just acknowledge the command
                                send_websocket_message(conn, {"type": "RESUMED"})
                        except json.JSONDecodeError:
                            print(f"Invalid JSON message: {message}")
                            continue
                        except Exception as e:
                            print(f"Error handling request: {e}")
                            continue
                
                except ConnectionResetError:
                    print(f"Connection reset by {addr}")
                    break
                except Exception as e:
                    print(f"Error in WebSocket communication: {e}")
                    break
        else:
            # Not a WebSocket request, handle as regular socket
            print("Non-WebSocket connection received")
            conn.send("HTTP/1.1 400 Bad Request\r\n\r\nWebSocket connection required".encode())
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

# Start the server
def start_server():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((HOST, PORT))
        server_socket.listen(5)
        print(f"Server listening on {HOST}:{PORT}")
        
        while True:
            try:
                conn, addr = server_socket.accept()
                client_thread = threading.Thread(target=handle_client, args=(conn, addr))
                client_thread.daemon = True
                client_thread.start()
            except KeyboardInterrupt:
                print("\nServer shutting down...")
                break
            except Exception as e:
                print(f"Error accepting connection: {e}")

def start_http_redirect():
    class RedirectHandler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            self.send_response(301)
            self.send_header('Location', f'http://{self.headers["Host"]}{self.path}')
            self.end_headers()

    httpd = http.server.HTTPServer((HOST, 80), RedirectHandler)
    httpd.serve_forever()

# Start the HTTP redirect in a separate thread
try:
    redirect_thread = threading.Thread(target=start_http_redirect, daemon=True)
    redirect_thread.start()
except Exception as e:
    print(f"Error starting HTTP redirect: {e}")

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