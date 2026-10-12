import React, { useState, useEffect, useRef } from 'react';
import { Folder, Plus, Trash2, Download, Upload, Sparkles, X, Check } from 'lucide-react';
import { Project } from '../types/daw';
import { listProjectsFromDB, deleteProjectFromDB, createDemoProject } from '../storage/db';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onLoadDemo: () => void;
  onExportProjectJSON: () => void;
  onImportProjectJSON: (file: File) => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  onNewProject,
  onLoadDemo,
  onExportProjectJSON,
  onImportProjectJSON,
}) => {
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchProjects = async () => {
    try {
      const list = await listProjectsFromDB();
      setProjectList(list);
    } catch (err) {
      console.error('Failed to load projects list:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      await deleteProjectFromDB(id);
      fetchProjects();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportProjectJSON(e.target.files[0]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">PROJECT STUDIO LIBRARY</h2>
              <p className="text-[11px] text-slate-400">Save, load, and manage your local DAW sessions</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-[#0e121a] border-b border-[#1f283a] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onNewProject();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Empty Project</span>
            </button>

            <button
              onClick={() => {
                onLoadDemo();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2233] hover:bg-[#253147] text-cyan-300 border border-[#27354d] font-semibold rounded-lg"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Load Cyber Echoes Demo</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onExportProjectJSON}
              title="Export project configuration as JSON"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171e2c] hover:bg-[#242f44] text-slate-300 hover:text-white border border-[#232f44] rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import project from JSON file"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171e2c] hover:bg-[#242f44] text-slate-300 hover:text-white border border-[#232f44] rounded-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
          </div>
        </div>

        {/* Saved Projects List */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-2.5 bg-[#0c0f16]">
          <span className="text-xs font-bold text-slate-400">
            LOCAL PROJECTS ({projectList.length})
          </span>

          {projectList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No saved projects yet. Your projects are stored securely in browser IndexedDB.
            </div>
          ) : (
            projectList.map((p) => {
              const isCurrent = p.id === currentProjectId;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    onClose();
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/30'
                      : 'bg-[#131722] border-[#222a3b] hover:bg-[#181e2b] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isCurrent
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-[#1d2434] text-slate-400'
                      }`}
                    >
                      {isCurrent ? <Check className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{p.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Saved: {new Date(p.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded font-mono">
                        CURRENT
                      </span>
                    )}

                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      title="Delete Project"
                      className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
