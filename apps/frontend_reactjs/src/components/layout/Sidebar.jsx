import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Settings, FileText, Plus, PenLine, Trash2, PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export function Sidebar({ sessions, activeSessionId, onSessionChange, onNewSession, onRenameSession, onDeleteSession }) {
  const location = useLocation();
  const [editingId, setEditingId] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    const userMsg = session.messages?.find(m => m.role === 'user');
    if (userMsg && userMsg.text) {
      return userMsg.text.slice(0, 25) + (userMsg.text.length > 25 ? '…' : '');
    }
    return `New Chat`;
  };

  const navItems = [
    { label: 'Workspace', path: '/', icon: <MessageSquare size={18} /> },
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'Analytics', path: '/analytics', icon: <FileText size={18} /> },
    { label: 'Knowledge Health', path: '/knowledge-health', icon: <ShieldCheck size={18} /> },
  ];

  const groupedSessions = {
    "Today": [],
    "Yesterday": [],
    "Last 7 Days": [],
    "Last 30 Days": [],
    "Older": []
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  sessions.forEach((s) => {
    if (!s.createdAt) {
       groupedSessions["Today"].push(s);
       return;
    }
    const d = new Date(s.createdAt);
    d.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - d.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) groupedSessions["Today"].push(s);
    else if (diffDays === 1) groupedSessions["Yesterday"].push(s);
    else if (diffDays <= 7) groupedSessions["Last 7 Days"].push(s);
    else if (diffDays <= 30) groupedSessions["Last 30 Days"].push(s);
    else groupedSessions["Older"].push(s);
  });

  return (
    <aside className={cn(
      "bg-charcoal-950 border-r border-charcoal-800 flex flex-col h-screen overflow-hidden transition-all duration-200 ease-in-out shrink-0 relative",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <div className="p-4 flex items-center justify-between border-b border-charcoal-800 h-[60px]">
        {!isCollapsed ? (
          <h1 className="text-lg font-semibold tracking-tight text-charcoal-50 flex items-center gap-2 overflow-hidden whitespace-nowrap">
            <div className="w-6 h-6 bg-teal-500 rounded flex items-center justify-center text-charcoal-1000 text-xs font-bold shrink-0">K</div>
            KnowledgeIQ
          </h1>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-6 h-6 bg-teal-500 rounded flex items-center justify-center text-charcoal-1000 text-xs font-bold shrink-0">K</div>
          </div>
        )}
      </div>

      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-charcoal-800 text-teal-400'
                  : 'text-charcoal-400 hover:text-charcoal-50 hover:bg-charcoal-800/50',
                isCollapsed ? 'justify-center' : 'gap-3'
              )}
            >
              <div className="shrink-0">{item.icon}</div>
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {!isCollapsed ? (
          <div className="flex items-center justify-between mb-4 px-3">
            <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">Chats</span>
            <button className="text-charcoal-400 hover:text-teal-400 transition-colors" onClick={onNewSession} title="New Chat">
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <div className="flex justify-center mb-4 mt-2">
            <button className="p-1.5 rounded-md bg-charcoal-800 text-charcoal-200 hover:bg-charcoal-700 transition-colors" onClick={onNewSession} title="New Chat">
              <Plus size={16} />
            </button>
          </div>
        )}
        
        {!isCollapsed && (
          <div className="space-y-6">
            {Object.entries(groupedSessions).map(([groupName, groupSessions]) => {
              if (groupSessions.length === 0) return null;
              return (
                <div key={groupName} className="space-y-1">
                  <div className="px-3 pb-1 text-[10px] font-bold text-charcoal-500 uppercase tracking-wider">
                    {groupName}
                  </div>
                  {groupSessions.map((session) => (
                    <div key={session.id} className="group flex items-center relative">
                      <button
                        onClick={() => onSessionChange(session.id)}
                        title={getSessionName(session.id)}
                        className={cn(
                          'flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors truncate',
                          session.id === activeSessionId
                            ? 'bg-charcoal-800/80 text-charcoal-50'
                            : 'text-charcoal-400 hover:bg-charcoal-800/40 hover:text-charcoal-200'
                        )}
                      >
                        {editingId === session.id ? (
                          <input
                            className="bg-transparent border-b border-teal-500 outline-none w-full text-charcoal-50"
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
                          getSessionName(session.id)
                        )}
                      </button>
                      <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(session.id);
                            setNameInput(getSessionName(session.id));
                          }}
                          className="p-1 bg-charcoal-900 text-charcoal-400 hover:text-teal-400 rounded transition-colors"
                          title="Rename session"
                        >
                          <PenLine size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteSession) onDeleteSession(session.id);
                          }}
                          className="p-1 bg-charcoal-900 text-charcoal-400 hover:text-red-400 rounded transition-colors"
                          title="Delete session"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-charcoal-800 flex flex-col gap-2">
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full">
            <button className="flex items-center gap-3 px-3 py-2 flex-1 rounded-md text-sm font-medium text-charcoal-400 hover:text-charcoal-50 hover:bg-charcoal-800/50 transition-colors">
              <Settings size={18} className="shrink-0" />
              <span>Settings</span>
            </button>
            <button onClick={() => setIsCollapsed(true)} className="p-2 text-charcoal-500 hover:text-charcoal-300 transition-colors" title="Collapse Sidebar">
              <PanelLeftClose size={16} />
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-2">
            <button className="p-2 text-charcoal-400 hover:text-charcoal-50 hover:bg-charcoal-800/50 rounded-md transition-colors" title="Settings">
              <Settings size={18} />
            </button>
            <button onClick={() => setIsCollapsed(false)} className="p-2 text-charcoal-500 hover:text-charcoal-300 transition-colors" title="Expand Sidebar">
              <PanelLeftOpen size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
