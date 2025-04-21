import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Volume2, Music2, Loader2, Settings, RefreshCw, Shield } from 'lucide-react';

interface Song {
  name: string;
  duration: string;
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [serverAddress, setServerAddress] = useState('localhost');
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [receivedChunks, setReceivedChunks] = useState<Uint8Array[]>([]);
  const [receivingAudio, setReceivingAudio] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [useSSL, setUseSSL] = useState(true); // Default to using SSL
  
  // Add this ref to store chunks
  const chunksRef = useRef<Uint8Array[]>([]);

  // Add these states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Add this function to format time (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Don't auto-connect, wait for user to enter server address and credentials
    if (isAuthenticated) {
      connectToServer();
    }
  }, [isAuthenticated]);

  const connectToServer = () => {
    try {
      setConnectionError(null);
      setIsReconnecting(true);
      
      // Use secure WebSocket protocol (wss://) if useSSL is true, otherwise use ws://
      const protocol = useSSL ? 'wss://' : 'ws://';
      const port = useSSL ? '8443' : '8080'; // Use different ports for secure vs non-secure
      
      // Use serverAddress state to build the WebSocket URL
      const ws = new WebSocket(`${protocol}${serverAddress}:${port}`);
      
      ws.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        console.log(`Connected to server at ${protocol}${serverAddress}:${port}`);
      };

      ws.onmessage = (event) => {
        // If it's binary data (song chunks)
        if (event.data instanceof Blob) {
          console.log(`Received chunk of size: ${event.data.size} bytes`);
          event.data.arrayBuffer().then((buffer: ArrayBuffer) => {
            const chunk = new Uint8Array(buffer);
            // Use ref for immediately available data
            chunksRef.current = [...chunksRef.current, chunk];
            // Also update state for component updates
            setReceivedChunks(prev => [...prev, chunk]);
          });
          return;
        }
        
        // Try to parse as JSON
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
          if (data.type === 'AUTH_REQUIRED') {
            setIsAuthenticated(false);
          } else if (data.type === 'AUTH_SUCCESS') {
            setIsAuthenticated(true);
            setSongs(data.songs.map((name: string) => ({ name, duration: '00:00' })));
          } else if (data.type === 'SONG_LIST') {
            setSongs(data.songs.map((name: string) => ({ name, duration: '00:00' })));
          } else if (data.type === 'SONG_PLAYING') {
            // Clear previous audio data
            chunksRef.current = [];
            setReceivedChunks([]);
            setReceivingAudio(true);
            setIsLoading(true);
            console.log(`Started receiving song: ${data.name}`);
          } else if (data.type === 'SONG_METADATA') {
            console.log(`Song metadata: ${data.name}, size: ${data.size} bytes`);
          } else if (data.type === 'SONG_ENDED') {
            setReceivingAudio(false);
            setIsLoading(false);
            console.log(`Finished receiving song. Total chunks: ${chunksRef.current.length}`);
            
            // Use the ref directly to access all chunks immediately
            if (chunksRef.current.length > 0) {
              const totalLength = chunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
              console.log(`Creating audio from ${totalLength} bytes`);
              
              const audioData = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of chunksRef.current) {
                audioData.set(chunk, offset);
                offset += chunk.length;
              }
              
              const blob = new Blob([audioData], { type: 'audio/mp3' });
              const url = URL.createObjectURL(blob);
              
              if (audioPlayer) {
                try {
                  // Log audio player state
                  console.log('Audio player before loading:', audioPlayer.readyState);
                  
                  // Clean up previous URL
                  if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);
                  
                  console.log('Setting audio source to:', url);
                  audioPlayer.src = url;
                  
                  // Set oncanplaythrough before trying to play
                  audioPlayer.oncanplaythrough = () => {
                    console.log('Audio can play through, attempting playback');
                    
                    // Attempt to play with explicit user interaction handling
                    const playPromise = audioPlayer.play();
                    
                    if (playPromise !== undefined) {
                      playPromise
                        .then(() => {
                          console.log('Audio playing successfully');
                          setIsPlaying(true);
                        })
                        .catch(err => {
                          console.error('Error playing audio:', err);
                          // Try a different approach if autoplay fails
                          if (err.name === 'NotAllowedError') {
                            console.log('Autoplay not allowed, require user interaction');
                            // Update UI to show play button
                            setIsPlaying(false);
                          }
                        });
                    }
                  };
                  
                  // Add loading and error handlers
                  audioPlayer.onloadeddata = () => console.log('Audio data loaded');
                  audioPlayer.onerror = (e) => console.error('Audio player error:', e);
                } catch (err) {
                  console.error('Error setting up audio player:', err);
                }
              } else {
                console.error('No audio player available');
              }
            } else {
              console.error('No chunks received for the song');
            }
          } else if (data.type === 'STREAM_ERROR') {
            console.error('Stream error:', data.error);
            setReceivingAudio(false);
            setIsLoading(false);
          }
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsReconnecting(false);
        // Don't auto reconnect or reset authentication
        console.log('Connection closed');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        const protocol = useSSL ? 'wss://' : 'ws://';
        const port = useSSL ? '8443' : '8080';
        setConnectionError(
          `Connection failed. Make sure the server is running and accessible at ${protocol}${serverAddress}:${port}. ${
            useSSL ? 'If using a self-signed certificate, you may need to visit https://' + serverAddress + ':' + port + ' first to accept it.' : ''
          }`
        );
        setIsReconnecting(false);
        setIsConnected(false);
      };

      setSocket(ws);
    } catch (error) {
      console.error('Connection error:', error);
      const protocol = useSSL ? 'wss://' : 'ws://';
      const port = useSSL ? '8443' : '8080';
      setConnectionError(`Failed to connect to ${protocol}${serverAddress}:${port}. Check the server address and try again.`);
      setIsReconnecting(false);
      setIsConnected(false);
    }
  };

  // Initialize audio player in a separate effect
  useEffect(() => {
    try {
      console.log('Initializing audio context and player');
      
      // Initialize AudioContext
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioContext(context);
      
      // Initialize audio player with detailed logging
      const player = new Audio();
      player.addEventListener('loadstart', () => console.log('Audio load started'));
      player.addEventListener('loadeddata', () => console.log('Audio data loaded'));
      player.addEventListener('canplay', () => console.log('Audio can play'));
      player.addEventListener('playing', () => {
        console.log('Audio playing');
        setIsLoading(false);
      });
      player.addEventListener('pause', () => console.log('Audio paused'));
      // Add ended event to automatically play next song
      player.addEventListener('ended', () => {
        console.log('Audio ended - playing next song');
        playNextSong();
      });
      player.addEventListener('error', (e) => console.error('Audio error:', e));
      
      player.addEventListener('loadedmetadata', () => {
        console.log('Audio metadata loaded, duration:', player.duration);
        setDuration(player.duration);
      });
      
      // Add timeupdate event to track progress
      player.addEventListener('timeupdate', () => {
        setCurrentTime(player.currentTime);
      });

      setAudioPlayer(player);
      
      return () => {
        console.log('Cleaning up audio resources');
        if (audioContext) context.close();
        if (player) {
          player.pause();
          if (player.src) URL.revokeObjectURL(player.src);
          player.src = '';
        }
      };
    } catch (err) {
      console.error('Error setting up audio:', err);
    }
  }, []);

  // Add helper function to open the HTTPS site to accept the certificate
  const openSecureWebsite = () => {
    const httpsUrl = `https://${serverAddress}:8443/`;
    window.open(httpsUrl, '_blank');
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Connect to the server first
    connectToServer();
    
    // Wait for connection before sending credentials
    setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(`${credentials.username}:${credentials.password}`);
      } else {
        console.error('Socket not ready when trying to authenticate');
      }
    }, 1000);
  };

  const handlePlaySong = (song: Song) => {
    if (!isAuthenticated || !socket) return;
  
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setCurrentSong(song);
    
    socket.send(JSON.stringify({
      type: 'PLAY_SONG',
      name: song.name
    }));
  };

  const togglePlayPause = () => {
    if (!currentSong || !audioPlayer) return;

    const newPlayingState = !isPlaying;
    
    if (newPlayingState) {
      // Try to play
      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            if (socket) {
              socket.send(JSON.stringify({ type: 'RESUME' }));
            }
          })
          .catch(err => {
            console.error('Error playing audio:', err);
          });
      }
    } else {
      // Pause
      audioPlayer.pause();
      setIsPlaying(false);
      if (socket) {
        socket.send(JSON.stringify({ type: 'PAUSE' }));
      }
    }
  };

  const toggleMute = () => {
    if (!audioPlayer) return;
    
    const newMutedState = !audioPlayer.muted;
    audioPlayer.muted = newMutedState;
    setIsMuted(newMutedState);
    
    console.log(`Audio ${newMutedState ? 'muted' : 'unmuted'}`);
  };

  const playNextSong = () => {
    if (!currentSong || songs.length <= 1) return;
    
    // Find current song index
    const currentIndex = songs.findIndex(song => song.name === currentSong.name);
    if (currentIndex === -1) return;
    
    // Calculate next song index (with wrap-around)
    const nextIndex = (currentIndex + 1) % songs.length;
    
    // Play the next song
    handlePlaySong(songs[nextIndex]);
    
    console.log(`Playing next song: ${songs[nextIndex].name}`);
  };
  
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center mb-8">
            <Music2 className="w-12 h-12 text-white" />
            <h1 className="text-3xl font-bold text-white ml-4">ByteBeats</h1>
          </div>
          
          {/* Connection guide */}
          <div className="bg-white/5 p-4 rounded-lg mb-6">
            <h2 className="text-white font-semibold mb-2">Secure Connection Guide</h2>
            <ol className="text-purple-200 text-sm space-y-1 ml-4 list-decimal">
              <li>Make sure both devices are on the same network or mobile hotspot</li>
              <li>Enter the server device's IP address below</li>
              <li>Choose whether to use secure connection (SSL)</li>
              <li>Log in with your username and password</li>
            </ol>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-white mb-2">Server Address</label>
              <input
                type="text"
                value={serverAddress}
                onChange={(e) => setServerAddress(e.target.value)}
                placeholder="IP address (e.g. 172.20.10.9)"
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
              />
              <p className="text-purple-300 text-xs mt-1">Use your server's IP address on the network</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useSSL"
                checked={useSSL}
                onChange={() => setUseSSL(!useSSL)}
                className="w-4 h-4 accent-purple-500"
              />
              <label htmlFor="useSSL" className="text-white flex items-center">
                <Shield className="w-4 h-4 mr-1 text-purple-300" />
                Use secure connection (SSL)
              </label>
            </div>
            
            {useSSL && (
              <div className="bg-purple-900/30 p-3 rounded-lg text-sm text-purple-200 flex items-start">
                <Shield className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                <p>
                  Using a self-signed certificate? You may need to{" "}
                  <button 
                    type="button"
                    onClick={openSecureWebsite}
                    className="text-purple-400 hover:text-white underline"
                  >
                    accept the certificate
                  </button>{" "}
                  in your browser first.
                </p>
              </div>
            )}
            
            <div>
              <label className="block text-white mb-2">Username</label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-white mb-2">Password</label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            
            {connectionError && (
              <div className="bg-red-500/20 text-red-200 p-3 rounded-lg text-sm">
                {connectionError}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isReconnecting}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center justify-center"
            >
              {isReconnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect to Server'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="p-6">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <Music2 className="w-8 h-8 text-white" />
            <h1 className="text-2xl font-bold text-white ml-3">ByteBeats</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-purple-300 flex items-center">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Connected to {serverAddress}
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  Disconnected
                </>
              )}
            </span>
            <button 
              onClick={toggleSettings} 
              className="p-2 rounded-full hover:bg-white/10"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-white mb-6">Connection Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-white mb-2">Server Address</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={serverAddress}
                    onChange={(e) => setServerAddress(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="pt-4 flex space-x-4 justify-end">
                <button
                  onClick={toggleSettings}
                  className="px-6 py-2 bg-transparent hover:bg-white/10 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (socket) socket.close();
                    connectToServer();
                    toggleSettings();
                  }}
                  className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition"
                >
                  Reconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
          {/* Now Playing */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Now Playing</h2>
            </div>
            
            <div className="flex items-center space-x-6">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                {isLoading ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : (
                  <Music2 className="w-12 h-12 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">
                  {currentSong ? currentSong.name : 'No song selected'}
                </h3>
                <p className="text-purple-300">
                  {currentSong ? currentSong.duration : 'Choose a song from the list below'}
                </p>
              </div>
            </div>

            {/* Player Controls */}
            <div className="mt-8 flex items-center justify-center space-x-6">
              <button 
                className="w-12 h-12 rounded-full bg-purple-500 hover:bg-purple-600 transition flex items-center justify-center"
                onClick={playNextSong}
                disabled={!currentSong || songs.length <= 1}
              >
                <SkipForward className="w-6 h-6 text-white" />
              </button>
              <button 
                className="w-16 h-16 rounded-full bg-white hover:bg-gray-100 transition flex items-center justify-center"
                onClick={togglePlayPause}
                disabled={!currentSong}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-purple-900" />
                ) : (
                  <Play className="w-8 h-8 text-purple-900" />
                )}
              </button>
              <button 
                className="w-12 h-12 rounded-full bg-purple-500 hover:bg-purple-600 transition flex items-center justify-center"
                onClick={toggleMute}
                disabled={!currentSong}
              >
                <Volume2 className={`w-6 h-6 text-white ${isMuted ? 'opacity-50' : 'opacity-100'}`} />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mt-4 w-full">
              <div className="flex justify-between text-purple-300 text-sm mb-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1">
                <div 
                  className="bg-purple-500 h-1 rounded-full" 
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Song List */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-6">Available Songs</h2>
            <div className="space-y-4">
              {songs.map((song) => (
                <button
                  key={song.name}
                  className="w-full bg-white/5 hover:bg-white/10 transition p-4 rounded-lg flex items-center justify-between group"
                  onClick={() => handlePlaySong(song)}
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded flex items-center justify-center">
                      <Music2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="ml-4 text-left">
                      <h3 className="text-white font-medium">{song.name}</h3>
                      <p className="text-purple-300 text-sm">{song.duration}</p>
                    </div>
                  </div>
                  <Play className="w-5 h-5 text-purple-300 opacity-0 group-hover:opacity-100 transition" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-8">
        <p className="text-center text-purple-300 text-sm">
          ByteBeats Music Player &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

export default App;