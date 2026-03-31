import React, { useState, useRef } from 'react';
import Game from './Game';

const DEFAULT_EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🤖', '👽', '👻', '🤡'];

export default function App() {
  const [step, setStep] = useState<'profile' | 'room' | 'game'>('profile');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_EMOJIS[0]);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setStep('room');
    }
  };

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newRoomId);
    setStep('game');
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinRoomId.trim()) {
      setRoomId(joinRoomId.toUpperCase());
      setStep('game');
    }
  };

  if (step === 'game') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Game roomId={roomId} username={username} avatar={avatar} onLeave={() => setStep('room')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-6 text-indigo-600">Multiplayer Tag</h1>
        
        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-6 animate-in fade-in">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Choose Avatar</label>
              <div className="flex flex-wrap gap-2 mb-4 justify-center">
                {DEFAULT_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    className={`text-3xl p-2 rounded-lg transition-colors ${avatar === emoji ? 'bg-indigo-100 border-2 border-indigo-500' : 'hover:bg-gray-100 border-2 border-transparent'}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="text-gray-500 text-sm">OR</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>
              <div className="mt-4 text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Upload Custom Image
                </button>
                {avatar.startsWith('data:') && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Selected Image:</p>
                    <img src={avatar} alt="Avatar preview" className="w-16 h-16 object-cover rounded-full mx-auto border-2 border-indigo-500" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                placeholder="Enter your name"
                required
                autoFocus
                maxLength={15}
              />
            </div>
            
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium"
            >
              Continue
            </button>
          </form>
        )}

        {step === 'room' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              {avatar.startsWith('data:') ? (
                <img src={avatar} alt="Avatar" className="w-12 h-12 object-cover rounded-full" />
              ) : (
                <span className="text-4xl">{avatar}</span>
              )}
              <div>
                <p className="text-sm text-gray-500">Playing as</p>
                <p className="font-bold text-gray-800">{username}</p>
              </div>
              <button 
                onClick={() => setStep('profile')}
                className="ml-auto text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Edit
              </button>
            </div>

            <button
              onClick={handleCreateRoom}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium text-lg shadow-sm"
            >
              Create New Room
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-gray-500 text-sm">OR</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {!showJoinInput ? (
              <button
                onClick={() => setShowJoinInput(true)}
                className="w-full bg-white text-indigo-600 border-2 border-indigo-600 py-3 px-4 rounded-md hover:bg-indigo-50 transition-colors font-medium text-lg"
              >
                Join Existing Room
              </button>
            ) : (
              <form onSubmit={handleJoinRoom} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <label htmlFor="joinRoomId" className="block text-sm font-medium text-gray-700 mb-1">
                    Enter Room ID
                  </label>
                  <input
                    type="text"
                    id="joinRoomId"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors uppercase"
                    placeholder="e.g. A1B2C3"
                    required
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowJoinInput(false)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                  >
                    Join
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
