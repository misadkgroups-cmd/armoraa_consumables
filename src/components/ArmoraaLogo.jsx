import React from 'react';
import './ArmoraaLogo.css';

/**
 * ArmoraaLogo
 * Razor-sharp, fully scalable vector brand mark that replaces the old
 * blurry armoraa-logo.png.
 *
 * variant="full"  -> glow + icon + "armoraa®" + "Skin | Hair | Laser Clinic" pill
 * variant="mark"  -> glow + icon only (for use alongside existing headings)
 */
const ArmoraaLogo = ({ variant = 'full', iconSize = 80, className = '' }) => {
  const isFull = variant === 'full';

  return (
    <div className={`armoraa-logo ${className}`}>
      {/* Soft radial purple aura behind the icon */}
      <div className="armoraa-logo__glow" style={{ width: iconSize * 1.5, height: iconSize * 1.5 }} />

      {/* Sharp vector logo icon */}
      <svg
        className="armoraa-logo__icon"
        style={{ width: iconSize, height: iconSize }}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="armoraaPurpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke="url(#armoraaPurpleGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Top Loop */}
          <path d="M 50,45 A 15,15 0 1,1 65,30 A 15,15 0 0,1 50,45 Z" />
          {/* Bottom Left Loop */}
          <path d="M 37,68 A 15,15 0 1,1 37,38" />
          {/* Bottom Right Loop */}
          <path d="M 63,38 A 15,15 0 1,1 63,68" />
          {/* Interconnecting Center Knot */}
          <path d="M 37,53 C 42,48 58,48 63,53" />
          <path d="M 50,30 C 45,45 42,55 37,53" />
          <path d="M 50,30 C 55,45 58,55 63,53" />
        </g>
      </svg>

      {isFull && (
        <>
          {/* Brand Typography */}
          <h1 className="armoraa-logo__brand">
            armoraa<span className="armoraa-logo__registered">®</span>
          </h1>

          {/* Subtitle Pill */}
          <div className="armoraa-logo__pill">Skin | Hair | Laser Clinic</div>
        </>
      )}
    </div>
  );
};

export default ArmoraaLogo;