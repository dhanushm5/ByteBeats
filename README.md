# ByteBeats 🎵

ByteBeats is a modern, secure music streaming application that lets you stream your personal music collection between devices on the same network. It features a beautiful React-based web interface and a Python-based streaming server with WebSocket support.

![ByteBeats Screenshot](https://placeholder.com/screenshot.png)

## Features

- 🎧 Stream MP3 files from your server to any device on the same network
- 🔒 Secure WebSocket connections with SSL/TLS encryption
- 👤 User authentication to protect your music library
- 📱 Responsive design that works on desktop and mobile devices
- 🌈 Modern UI with beautiful gradients and animations
- 🔄 Real-time playback controls (play, pause, skip)
- 🔊 Volume control and muting

## Architecture

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Python-based WebSocket server
- **Communication**: Secure WebSockets (WSS)
- **Media**: MP3 streaming with chunk-based transfer

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- Modern web browser

### Server Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ByteBeats.git
   cd ByteBeats
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Add your MP3 files to the `music` directory:
   ```bash
   mkdir -p music
   # Copy your .mp3 files to the music directory
   ```

4. Configure users (edit `server/server.py`):
   ```python
   # Replace these with your own usernames and passwords
   USERS = {
       "user1": hashlib.sha256("password1".encode()).hexdigest(),
       "user2": hashlib.sha256("password2".encode()).hexdigest()
   }
   ```

5. Run the server:
   ```bash
   python server/server.py
   ```
   The server will start on port 8443 (with SSL) or 8080 (without SSL).

### Web Client Setup

1. Install npm dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   The web client will be available at http://localhost:5173

3. Build for production:
   ```bash
   npm run build
   ```

### Terminal Client (Optional)

A simple Python terminal client is provided for testing:

```bash
python client/client.py
```

## Connection Guide

1. Make sure both the server and client devices are on the same network
2. Find the IP address of the server on your network
3. Enter the server IP in the client login screen
4. Log in with a username and password configured in the server

## Security Note

The default server configuration uses self-signed SSL certificates. When connecting with a browser, you may need to visit the server URL directly (e.g., https://server-ip:8443) and accept the certificate warning before connecting through the app.

To use your own certificates, replace the files in the `server/certs` directory:
- `server.crt` - Your SSL certificate
- `server.key` - Your private key

## Development

### Project Structure

- `src/` - React frontend
- `server/` - Python WebSocket server
- `client/` - Python terminal client
- `music/` - Directory for MP3 files

### Frontend Technologies

- React 18
- TypeScript
- Vite
- TailwindCSS
- Lucide React (Icons)

### Backend Technologies

- Python socket server
- Custom WebSocket implementation
- SSL/TLS support

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.