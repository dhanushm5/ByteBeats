import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Volume2, Music2, Loader2 } from 'lucide-react';

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
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [receivedChunks, setReceivedChunks] = useState<Uint8Array[]>([]);
  const [receivingAudio, setReceivingAudio] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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
    const connectToServer = () => {
      try {
        // Use the correct WebSocket URL format for secure connections
        const ws = new WebSocket('ws://localhost:8080');
        
        ws.onopen = () => {
          setIsConnected(true);
          console.log('Connected to server');
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
              console.log(`Started receiving song: ${data.name}`);
            } else if (data.type === 'SONG_METADATA') {
              console.log(`Song metadata: ${data.name}, size: ${data.size} bytes`);
            } else if (data.type === 'SONG_ENDED') {
              setReceivingAudio(false);
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
            }
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setIsAuthenticated(false);
          setTimeout(connectToServer, 5000); // Reconnect after 5 seconds
        };

        setSocket(ws);
      } catch (error) {
        console.error('Connection error:', error);
        setTimeout(connectToServer, 5000);
      }
    };

    connectToServer();

    // This is the return from the useEffect
    return () => {
      if (socket) {
        socket.close();
      }
    };
  // The dependency array should NOT include receivedChunks to avoid reconnection loops
  }, [audioPlayer, audioContext]);

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
      player.addEventListener('playing', () => console.log('Audio playing'));
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

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket) {
      socket.send(`${credentials.username}:${credentials.password}`);
    }
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
    
    // Don't set isPlaying to true here, wait for the song to actually start playing
    // The SONG_ENDED handler will set it when the audio is ready to play
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center mb-8">
            <Music2 className="w-12 h-12 text-white" />
            <h1 className="text-3xl font-bold text-white ml-4">ByteBeats</h1>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
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
            <button
              type="submit"
              className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Connect to Server
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
          <div className="flex items-center">
            <span className="text-purple-300 flex items-center">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  Connected to Server
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  Disconnected
                </>
              )}
            </span>
          </div>
        </div>
      </header>

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