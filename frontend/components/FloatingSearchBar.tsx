"use client";

import React, { useState } from "react";

interface FloatingSearchBarProps {
  onSearch?: (query: string) => void;
  onDirectionsClick?: () => void;
  onMenuClick?: () => void;
  placeholder?: string;
  isDirectionsOpen?: boolean;
}

export default function FloatingSearchBar({
  onSearch,
  onDirectionsClick,
  onMenuClick,
  placeholder = "Search UnStranded or EV charger...",
  isDirectionsOpen = false,
}: FloatingSearchBarProps) {
  const [query, setQuery] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch(query);
    }
  };

  return (
    <div className="absolute top-3 left-3 z-[1000] w-[392px] max-w-[calc(100vw-24px)] font-sans">
      <div className="bg-white h-12 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)] flex items-center px-3.5 space-x-2">
        {/* Menu / Hamburger Icon */}
        <button
          type="button"
          aria-label="Menu"
          onClick={onMenuClick || onDirectionsClick}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Search Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 text-[15px] bg-transparent border-none outline-none text-slate-800 placeholder-slate-500 font-normal"
        />

        {/* Magnifying Glass Search Button */}
        <button
          type="button"
          aria-label="Search"
          onClick={() => onSearch && onSearch(query)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
        </button>

        {/* Thin Divider */}
        <div className="w-[1px] h-6 bg-slate-200" />

        {/* Blue Circular Directions Button */}
        <button
          type="button"
          aria-label="Directions"
          onClick={onDirectionsClick}
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition ${
            isDirectionsOpen
              ? "bg-blue-700 text-white ring-2 ring-blue-300"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          title="Open Directions & EV Planner"
        >
          <svg className="w-4 h-4 rotate-45" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
