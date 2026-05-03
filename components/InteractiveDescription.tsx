import React from 'react';
import { useNavigate } from './Router';

export default function InteractiveDescription({ text, className = "" }: { text: string, className?: string }) {
    const navigate = useNavigate();

    if (!text) return null;

    const parts = text.split(/(#\w+)/g);

    return (
        <p className={className}>
            {parts.map((part, i) => {
                if (part.startsWith('#')) {
                    const tag = part.substring(1);
                    return (
                        <span
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/?q=${encodeURIComponent(tag)}`);
                            }}
                            className="text-[#2d88ff] hover:underline cursor-pointer font-bold"
                        >
                            {part}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </p>
    );
}
