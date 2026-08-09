import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSessionChange,
  onNewSession,
  onFeedbackOpen,
  onRenameSession
}) {
  const [editingId, setEditingId] = useState(null);
  const [nameInput, setNameInput] = useState('');

  const handleRename = (sessionId) => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== getSessionName(sessionId)) {
      onRenameSession(sessionId, trimmed);
    }
    setEditingId(null);
    setNameInput('');
  };

  const getSessionName = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return '';
    if (session.name && session.name.trim() !== '') return session.name;
    if (session.messages && session.messages.length > 0)
      return session.messages[0].text.slice(0, 25) +
        (session.messages[0].text.length > 25 ? '…' : '');
    return `Session ${sessions.findIndex(s => s.id === sessionId) + 1}`;
  };

  return (
    <aside className="w-64 bg-white shadow-lg p-4 flex flex-col justify-between h-screen">
      <div>
        <h2 className="text-xl font-semibold mb-4">Chat History</h2>
        <button
          onClick={onNewSession}
          className="mb-4 bg-blue-600 text-white px-3 py-1 rounded w-full"
        >
          ➕ New Session
        </button>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center group">
              <button
                onClick={() => onSessionChange(session.id)}
                className={`flex-1 text-left px-3 py-1 rounded transition ${
                  session.id === activeSessionId
                    ? 'bg-blue-100 font-medium'
                    : 'hover:bg-gray-100'
                }`}
                title={getSessionName(session.id)}
              >
                {editingId === session.id ? (
                  <input
                    className="border-b px-1 w-4/5"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={() => handleRename(session.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(session.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="truncate">
                    {getSessionName(session.id)}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setEditingId(session.id);
                  setNameInput(getSessionName(session.id));
                }}
                className="ml-1 text-xs text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Rename session"
                tabIndex={-1}
              >
                ✏️
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 mt-6 border-t pt-4">
        <Link
          to="/dashboard"
          className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
        >
          📊 Governance Dashboard
        </Link>
        <Link
          to="/analytics"
          className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
        >
          📈 Enterprise Analytics
        </Link>
        <button
          onClick={onFeedbackOpen}
          className="text-sm text-gray-600 hover:text-gray-800 underline text-left"
        >
          🗂 View Feedback
        </button>
      </div>
    </aside>
  );
}
