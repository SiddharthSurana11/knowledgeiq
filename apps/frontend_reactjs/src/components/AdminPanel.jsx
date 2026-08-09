import React, { useEffect, useState } from 'react';
import { X, Search } from 'lucide-react';

export default function AdminPanel({ isOpen, onClose, apiGateway }) {
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetch(`${apiGateway}/api/admin/feedback`)
        .then(res => res.json())
        .then(json => {
          setFeedbackList(json.data || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isOpen, apiGateway]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-charcoal-1000/80 backdrop-blur-sm flex justify-end z-50">
      <div className="w-full max-w-md bg-charcoal-950 h-full shadow-2xl flex flex-col border-l border-charcoal-800">
        <div className="p-4 border-b border-charcoal-800 flex justify-between items-center bg-charcoal-900/50">
          <h2 className="text-lg font-semibold text-charcoal-50 flex items-center gap-2">
            <Search size={18} className="text-teal-500" /> System Feedback
          </h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-50 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-charcoal-500 text-sm">Loading feedback...</p>
          ) : feedbackList.length === 0 ? (
            <p className="text-charcoal-500 text-sm">No feedback logs found.</p>
          ) : (
            <ul className="space-y-4">
              {feedbackList.map((item, idx) => (
                <li key={idx} className="p-4 border border-charcoal-800 bg-charcoal-900 rounded-lg">
                  <p className="text-sm text-charcoal-200"><strong className="text-charcoal-400 font-medium">Session ID:</strong> {item.sessionId}</p>
                  <p className="text-sm text-charcoal-200 mt-2"><strong className="text-charcoal-400 font-medium">Message:</strong> {item.text}</p>
                  {item.feedback && (
                    <p className="text-xs text-charcoal-400 mt-3 pt-3 border-t border-charcoal-800 uppercase tracking-wider font-semibold">
                      Feedback ID: {item.feedback}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
