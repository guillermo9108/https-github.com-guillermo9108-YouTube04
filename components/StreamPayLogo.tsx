import React from 'react';

interface StreamPayLogoProps {
  className?: string;
  height?: number | string;
}

export const StreamPayLogo: React.FC<StreamPayLogoProps> = ({ className = 'h-8', height }) => {
  return (
    <svg 
      viewBox="0 0 210 50" 
      className={className}
      style={height ? { height } : undefined}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dynamic bright neon blue gradient for the play button & swooshes */}
        <linearGradient id="streampayIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F2FE" />
          <stop offset="50%" stopColor="#00c6ff" />
          <stop offset="100%" stopColor="#0072ff" />
        </linearGradient>

        {/* Text gradient for 'Stream' to give it a modern vibrant feel */}
        <linearGradient id="streampayStreamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>

        {/* Text gradient for 'Pay' */}
        <linearGradient id="streampayPayGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* ICON GROUP */}
      <g transform="translate(4, 2)">
        {/* Pixel/bits on top-left of play button */}
        <rect x="15" y="14" width="4.5" height="4.5" fill="#00c6ff" rx="1" />
        <rect x="21" y="9" width="5.5" height="5.5" fill="#00F2FE" rx="1.2" />
        <rect x="9" y="19" width="3.5" height="3.5" fill="#0072ff" rx="0.8" />

        {/* Dynamic Sweep / Motion Trails */}
        {/* Top/Middle Swoosh */}
        <path 
          d="M 3 29 C 11 29, 21 27, 26 23" 
          stroke="url(#streampayIconGrad)" 
          strokeWidth="3" 
          strokeLinecap="round" 
        />
        {/* Main Lower Swoosh */}
        <path 
          d="M -1 33 C 10 33, 21 31, 26 25" 
          stroke="url(#streampayIconGrad)" 
          strokeWidth="3.5" 
          strokeLinecap="round" 
        />
        {/* Bottom Swoosh */}
        <path 
          d="M 7 37 C 14 37, 21 35, 26 28" 
          stroke="url(#streampayIconGrad)" 
          strokeWidth="2" 
          strokeLinecap="round" 
        />

        {/* Play Button Outer Triangle Frame */}
        <path 
          d="M 27 12.5 L 47 24 C 48.5 24.8, 48.5 26.2, 47 27 L 27 38.5 C 25.5 39.3, 24 38.5, 24 36.5 L 24 14.5 C 24 12.5, 25.5 11.7, 27 12.5 Z" 
          fill="none" 
          stroke="url(#streampayIconGrad)" 
          strokeWidth="4.5" 
          strokeLinejoin="round" 
          strokeLinecap="round" 
        />
        
        {/* Inner core accent */}
        <path 
          d="M 29.5 17 L 41 24.5 L 29.5 32 Z" 
          fill="url(#streampayIconGrad)" 
          opacity="0.25" 
        />
      </g>

      {/* TEXT GROUP: "StreamPay" (Italicized style) */}
      <g transform="translate(56, 33)">
        {/* Using skew to make it perfectly slanted and matching the premium logo style */}
        <g transform="skewX(-11)">
          {/* 'Stream' in light cyan-blue */}
          <text 
            x="0" 
            y="0" 
            fill="url(#streampayStreamGrad)" 
            fontWeight="800" 
            style={{ 
              fontFamily: '"Outfit", "Inter", "system-ui", sans-serif',
              fontSize: '28px',
              letterSpacing: '-0.5px'
            }}
          >
            Stream
          </text>
          
          {/* 'Pay' in rich sapphire-blue */}
          <text 
            x="96" 
            y="0" 
            fill="url(#streampayPayGrad)" 
            fontWeight="900" 
            style={{ 
              fontFamily: '"Outfit", "Inter", "system-ui", sans-serif',
              fontSize: '28px',
              letterSpacing: '-0.5px'
            }}
          >
            Pay
          </text>
        </g>
      </g>
    </svg>
  );
};

export default StreamPayLogo;
