# ByteBeats Music Streaming App

A lightweight music streaming application that lets you stream your music collection between devices on the same network. ByteBeats features a Python WebSocket server and a modern React web client with a sleek UI.

![ByteBeats Screenshot](https://via.placeholder.com/800x450.png?text=ByteBeats+Music+Player)

## Features

- Stream music from a central server to multiple devices
- Modern, responsive web interface
- Real-time audio playback with controls (play/pause/skip)
- Authentication system to protect your music collection
- Cross-device compatibility (works on desktop and mobile browsers)
- Connect devices over the same network or mobile hotspot
- **Secure SSL/TLS connections for enhanced privacy**

## Prerequisites

### Server Requirements
- Python 3.6 or higher
- PyOpenSSL library (for SSL certificate generation)
- Basic understanding of command line operations

### Client Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Node.js and npm (for development only)

## Quick Start Guide

### 1. Setting Up the Server

1. Clone this repository to your server device:
   ```
   git clone https://github.com/yourusername/ByteBeats.git
   cd ByteBeats
   ```

2. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Add your MP3 files to the `music` directory. If it doesn't exist, the server will create it automatically.

4. Start the server:
   ```
   python server/server.py
   ```

5. The server will start listening on port 8443 (for secure connections) on all network interfaces. 
   - SSL certificates will be automatically generated if they don't exist
   - The first time you connect from a browser, you'll need to accept the self-signed certificate

### 2. Setting Up the Client (Development)

1. Install Node.js dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

### 3. Building for Production

1. Build the client:
   ```
   npm run build
   ```

2. The built files will be in the `dist` directory, which you can serve using any web server.

## Secure Connections with SSL/TLS

ByteBeats now supports secure WebSocket connections (WSS) for enhanced privacy:

1. **Certificate Generation**: 
   - Self-signed certificates are automatically generated when the server starts
   - Certificates are stored in the `server/certs` directory

2. **Connecting Securely**:
   - The React client connects using `wss://` protocol to port 8443
   - You can choose between secure (SSL) or non-secure connections in the login screen
   - For self-signed certificates, you'll need to accept the certificate warning

3. **Accepting Self-Signed Certificates**:
   - When connecting for the first time, you may see security warnings in your browser
   - Click the "accept the certificate" button in the login screen which opens the server URL
   - In the new tab, click "Advanced" and then "Proceed" to accept the certificate
   - Return to the ByteBeats app and click "Connect to Server"

## Connecting Devices Over a Mobile Hotspot

To stream music between devices using a mobile hotspot:

1. **Create a Mobile Hotspot**:
   - On your mobile device or computer, create a mobile hotspot
   - Note the network name and password

2. **Connect Both Devices**:
   - Connect both the server and client devices to the same mobile hotspot

3. **Find Server IP Address**:
   - On the server device, find its IP address on the hotspot network
   - On macOS/Linux: `ifconfig` or `ip addr`
   - On Windows: `ipconfig`
   - Look for an IP address like `192.168.x.x` or `172.x.x.x` associated with your WiFi interface

4. **Connect Client to Server**:
   - On the client device, open the ByteBeats web app
   - Enter the server's IP address in the login screen
   - Choose whether to use a secure connection (SSL)
   - Enter your username and password
   - Click "Connect to Server"

## Default Users

The server includes two default users for testing:
- Username: `user1`, Password: `password1`
- Username: `user2`, Password: `password2`

For security, you should modify these credentials in `server.py` before using the app in a shared environment.

## Using ByteBeats

### Playing Music

1. Log in with your username and password
2. Browse the list of available songs
3. Click on a song to start playing
4. Use the playback controls to:
   - Play/pause the current song
   - Skip to the next song
   - Adjust volume or mute

### Managing Connection

- The connection status is shown in the top right corner
- If the connection is lost, you can reconnect using the settings menu
- You can change the server address in the settings menu

## Troubleshooting

### Connection Issues

- **Can't connect to server**: Make sure both devices are on the same network and the server is running
- **Connection refused**: Check if the server is running and if port 8443 is open
- **SSL certificate errors**: Follow the certificate acceptance steps mentioned above
- **Authentication failed**: Double-check your username and password

### Audio Issues

- **No sound playing**: Check if your device volume is turned up and not muted
- **Playback stuttering**: This can happen on slow networks, try reducing the distance to your router

### Server Issues

- **'Address already in use' error**: Another process is using port 8443. Either close that process or change the port in `server.py`
- **No songs appearing**: Make sure you have added MP3 files to the `music` directory
- **SSL certificate generation errors**: Make sure PyOpenSSL is installed: `pip install pyopenssl`

## Technical Details

ByteBeats uses:
- WebSocket protocol for real-time communication
- WSS (WebSocket Secure) for encrypted connections
- React for the frontend UI
- Tailwind CSS for styling
- Binary data streaming for efficient music transfer
- Self-signed certificates for development (use proper certificates for production)

## Future Enhancements

- Playlist creation and management
- User account management
- Song metadata and album art display
- Audio equalizer and effects
- Mobile apps for iOS and Android

## License

[Your chosen license]

---

Created with ❤️ by [Your Name]