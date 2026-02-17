import React from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title: string;
  duration: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, poster, title, duration }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden bg-black group cursor-pointer">
      <video
        src={src}
        poster={poster}
        controls={isPlaying}
        autoPlay={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-auto"
      />
      
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
          <button
            onClick={() => setIsPlaying(true)}
            className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition"
          >
            <span className="text-xl">▶️</span>
          </button>
          
          <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-sm">
            {duration}
          </div>
        </div>
      )}
      
      <h3 className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white font-semibold">
        {title}
      </h3>
    </div>
  );
};

export default VideoPlayer;
