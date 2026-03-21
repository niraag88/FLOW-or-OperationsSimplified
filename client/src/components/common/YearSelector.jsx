import React from "react";

export default function YearSelector({ financialYears, selectedYearId, onYearChange }) {
  if (!financialYears || financialYears.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Year:</span>
      <button
        onClick={() => onYearChange(null)}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
          selectedYearId === null
            ? "bg-gray-800 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        All Years
      </button>
      {financialYears.map(book => (
        <button
          key={book.id}
          onClick={() => onYearChange(book.id)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            selectedYearId === book.id
              ? book.status === "Closed"
                ? "bg-red-700 text-white"
                : "bg-sky-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {book.year}
          {book.status === "Closed" && (
            <span className="ml-1 text-xs opacity-80">🔒</span>
          )}
        </button>
      ))}
    </div>
  );
}
