import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Search, Monitor, Tag, X, Pencil, Trash2, Palette, Sun, Moon, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile, ProfileCreateData, TagInfo } from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import { StatusIndicator } from "./StatusIndicator";

interface ProfileListProps {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  // Tag management
  tags: TagInfo[];
  onUpdateProfile: (id: string, data: Partial<ProfileCreateData>) => Promise<any>;
  onRefreshProfiles: () => Promise<void>;
  onUpdateTag: (tagName: string, data: { new_name?: string; color?: string | null }) => Promise<boolean>;
  onDeleteTag: (tagName: string) => Promise<boolean>;
  onRefreshTags: () => Promise<void>;
  onOpenAdmin: () => void;
}

type ViewMode = "all" | "byTag";

const TAG_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444",
  "#06b6d4", "#a855f7", "#f97316", "#ec4899",
];

export function ProfileList({
  profiles,
  selectedId,
  onSelect,
  onNew,
  tags,
  onUpdateProfile,
  onRefreshProfiles,
  onUpdateTag,
  onDeleteTag,
  onRefreshTags,
  onOpenAdmin,
}: ProfileListProps) {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set(["__untagged__"]));
  const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<{ original: string; name: string; color: string | null } | null>(null);
  const [newTagInput, setNewTagInput] = useState<{ profileId: string; name: string; color: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTagMenuOpen(null);
        setProfileMenuOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Expand all tags on first switch to byTag mode
  useEffect(() => {
    if (viewMode === "byTag" && expandedTags.size <= 1) {
      setExpandedTags(new Set(["__untagged__", ...tags.map((t) => t.tag)]));
    }
  }, [viewMode, tags]);

  const filtered = profiles.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const runningCount = profiles.filter((p) => p.status === "running").length;

  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Group profiles by tag
  const taggedProfiles = new Map<string, Profile[]>();
  const untagged: Profile[] = [];
  for (const p of filtered) {
    if (p.tags.length === 0) {
      untagged.push(p);
    } else {
      for (const t of p.tags) {
        if (!taggedProfiles.has(t.tag)) taggedProfiles.set(t.tag, []);
        taggedProfiles.get(t.tag)!.push(p);
      }
    }
  }

  const handleAddTagToProfile = useCallback(
    async (profileId: string, tagName: string, tagColor: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) return;
      if (profile.tags.some((t) => t.tag === tagName)) return;
      const newTags = [...profile.tags, { tag: tagName, color: tagColor }];
      await onUpdateProfile(profileId, { tags: newTags });
      await onRefreshProfiles();
      await onRefreshTags();
      setNewTagInput(null);
    },
    [profiles, onUpdateProfile, onRefreshProfiles, onRefreshTags],
  );

  const handleRemoveTagFromProfile = useCallback(
    async (profileId: string, tagName: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) return;
      const newTags = profile.tags.filter((t) => t.tag !== tagName);
      await onUpdateProfile(profileId, { tags: newTags });
      await onRefreshProfiles();
      await onRefreshTags();
    },
    [profiles, onUpdateProfile, onRefreshProfiles, onRefreshTags],
  );

  const handleRenameTag = useCallback(
    async () => {
      if (!editingTag) return;
      const data: { new_name?: string; color?: string | null } = {};
      if (editingTag.name !== editingTag.original) data.new_name = editingTag.name;
      if (editingTag.color !== undefined) data.color = editingTag.color;
      if (Object.keys(data).length > 0) {
        await onUpdateTag(editingTag.original, data);
        await onRefreshProfiles();
      }
      setEditingTag(null);
    },
    [editingTag, onUpdateTag, onRefreshProfiles],
  );

  const handleDeleteTag = useCallback(
    async (tagName: string) => {
      if (!confirm(`Remove tag "${tagName}" from all profiles?`)) return;
      await onDeleteTag(tagName);
      await onRefreshProfiles();
      setTagMenuOpen(null);
    },
    [onDeleteTag, onRefreshProfiles],
  );

  // Render a single profile item
  const renderProfile = (profile: Profile, showTags = true) => (
    <div key={profile.id} className="relative group">
      <button
        onClick={() => onSelect(profile.id)}
        className={`w-full text-left px-3 py-2 rounded-md mb-0.5 transition-colors ${
          selectedId === profile.id
            ? "bg-surface-3 border border-border-hover"
            : "hover:bg-surface-2 border border-transparent"
        }`}
      >
        <div className="flex items-center gap-2">
          <StatusIndicator status={profile.status} />
          <span className="text-sm font-medium truncate flex-1">{profile.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 ml-4">
          <span className="text-xs text-gray-500 capitalize">{profile.platform}</span>
          {profile.proxy && (
            <>
              <span className="text-xs text-gray-600">·</span>
              <span className="text-xs text-gray-500">Proxy</span>
            </>
          )}
        </div>
        {showTags && profile.tags.length > 0 && (
          <div className="flex gap-1 mt-1 ml-4 flex-wrap">
            {profile.tags.map((t) => (
              <span
                key={t.tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-4 text-gray-400"
                style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
              >
                {t.tag}
              </span>
            ))}
          </div>
        )}
      </button>
      {/* Profile context menu button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setProfileMenuOpen(profileMenuOpen === profile.id ? null : profile.id);
          setTagMenuOpen(null);
        }}
        className="absolute right-1.5 top-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-4 text-gray-500 hover:text-gray-300 transition-opacity"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {/* Profile context menu */}
      {profileMenuOpen === profile.id && (
        <div ref={menuRef} className="absolute right-0 top-8 z-50 w-48 bg-surface-3 border border-border rounded-md shadow-lg py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Add tag</div>
          {tags.filter((t) => !profile.tags.some((pt) => pt.tag === t.tag)).map((t) => (
            <button
              key={t.tag}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-4 flex items-center gap-2"
              onClick={async () => {
                await handleAddTagToProfile(profile.id, t.tag, t.color ?? "#6366f1");
                setProfileMenuOpen(null);
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color ?? "#6366f1" }} />
              {t.tag}
            </button>
          ))}
          {tags.length > 0 && profile.tags.length > 0 && (
            <div className="border-t border-border my-1" />
          )}
          {profile.tags.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Remove tag</div>
              {profile.tags.map((t) => (
                <button
                  key={t.tag}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-4 flex items-center gap-2"
                  onClick={async () => {
                    await handleRemoveTagFromProfile(profile.id, t.tag);
                    setProfileMenuOpen(null);
                  }}
                >
                  <X className="h-3 w-3" />
                  {t.tag}
                </button>
              ))}
            </>
          )}
          {tags.filter((t) => !profile.tags.some((pt) => pt.tag === t.tag)).length === 0 && profile.tags.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-gray-500">No tags available</div>
          )}
          {/* Inline new tag for this profile */}
          <div className="border-t border-border mt-1 pt-1 px-2 pb-1">
            {newTagInput?.profileId === profile.id ? (
              <div className="flex gap-1 items-center">
                <input
                  autoFocus
                  className="flex-1 bg-surface-2 border border-border rounded px-1.5 py-0.5 text-xs text-gray-100 outline-none focus:border-accent"
                  placeholder="Tag name"
                  value={newTagInput.name}
                  onChange={(e) => setNewTagInput({ ...newTagInput, name: e.target.value })}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTagInput.name.trim()) {
                      await handleAddTagToProfile(profile.id, newTagInput.name.trim(), newTagInput.color);
                      setProfileMenuOpen(null);
                    }
                    if (e.key === "Escape") setNewTagInput(null);
                  }}
                />
                <div className="flex gap-0.5">
                  {TAG_COLORS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      className="w-3 h-3 rounded-full border"
                      style={{
                        backgroundColor: c,
                        borderColor: newTagInput.color === c ? "#fff" : "transparent",
                      }}
                      onClick={() => setNewTagInput({ ...newTagInput, color: c })}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <button
                className="w-full text-left text-xs text-gray-400 hover:text-gray-200 py-0.5 flex items-center gap-1"
                onClick={() => setNewTagInput({ profileId: profile.id, name: "", color: "#6366f1" })}
              >
                <Plus className="h-3 w-3" /> New tag
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Render tag section header
  const renderTagHeader = (tagName: string, color: string | null, count: number, isUntagged = false) => {
    const expanded = expandedTags.has(isUntagged ? "__untagged__" : tagName);
    const key = isUntagged ? "__untagged__" : tagName;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 group/tag relative">
        <button
          onClick={() => toggleTag(key)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {expanded
            ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
            : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
          {!isUntagged && (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color ?? "#6366f1" }}
            />
          )}
          <span className="text-xs font-medium text-gray-300 truncate">
            {isUntagged ? "Untagged" : tagName}
          </span>
          <span className="text-[10px] text-gray-600 flex-shrink-0">{count}</span>
        </button>
        {!isUntagged && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTagMenuOpen(tagMenuOpen === tagName ? null : tagName);
              setProfileMenuOpen(null);
            }}
            className="p-0.5 rounded opacity-0 group-hover/tag:opacity-100 hover:bg-surface-4 text-gray-500 hover:text-gray-300 transition-opacity"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        )}
        {/* Tag context menu */}
        {tagMenuOpen === tagName && !isUntagged && (
          <div ref={menuRef} className="absolute right-0 top-full z-50 w-44 bg-surface-3 border border-border rounded-md shadow-lg py-1">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-4 flex items-center gap-2"
              onClick={() => {
                const existing = tags.find((t) => t.tag === tagName);
                setEditingTag({
                  original: tagName,
                  name: tagName,
                  color: existing?.color ?? null,
                });
                setTagMenuOpen(null);
              }}
            >
              <Pencil className="h-3 w-3" /> Rename / Recolor
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-4 flex items-center gap-2"
              onClick={() => handleDeleteTag(tagName)}
            >
              <Trash2 className="h-3 w-3" /> Delete tag
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="h-4 w-4 text-accent" />
          <h1 className="text-sm font-semibold tracking-tight flex-1">CloakBrowser Manager</h1>
          <button
            onClick={onOpenAdmin}
            className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
            title="Admin Dashboard"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
        {runningCount > 0 && (
          <div className="text-xs text-gray-500 mb-3">
            {runningCount} running
          </div>
        )}
        {/* View mode toggle */}
        <div className="flex gap-1 mb-3 bg-surface-2 rounded-md p-0.5">
          <button
            onClick={() => setViewMode("all")}
            className={`flex-1 text-xs py-1 rounded transition-colors ${
              viewMode === "all"
                ? "bg-surface-4 text-gray-200"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setViewMode("byTag")}
            className={`flex-1 text-xs py-1 rounded transition-colors flex items-center justify-center gap-1 ${
              viewMode === "byTag"
                ? "bg-surface-4 text-gray-200"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <Tag className="h-3 w-3" />
            By Tag
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search profiles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-8 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Editing tag inline */}
      {editingTag && (
        <div className="p-3 border-b border-border bg-surface-2 space-y-2">
          <div className="text-[10px] font-semibold text-gray-500 uppercase">Edit Tag</div>
          <input
            autoFocus
            className="w-full bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-100 outline-none focus:border-accent"
            value={editingTag.name}
            onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameTag();
              if (e.key === "Escape") setEditingTag(null);
            }}
          />
          <div className="flex gap-1 items-center">
            <Palette className="h-3 w-3 text-gray-500" />
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                className="w-4 h-4 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: c,
                  borderColor: editingTag.color === c ? "#fff" : "transparent",
                  transform: editingTag.color === c ? "scale(1.15)" : undefined,
                }}
                onClick={() => setEditingTag({ ...editingTag, color: c })}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleRenameTag} className="btn-primary text-xs py-1 px-2 flex-1">
              Save
            </button>
            <button onClick={() => setEditingTag(null)} className="btn-secondary text-xs py-1 px-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Profile list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-8">
            {profiles.length === 0 ? "No profiles yet" : "No matches"}
          </div>
        )}

        {viewMode === "all" && filtered.map((profile) => renderProfile(profile, true))}

        {viewMode === "byTag" && (
          <>
            {/* Tag sections */}
            {tags
              .filter((t) => taggedProfiles.has(t.tag))
              .map((t) => (
                <div key={t.tag} className="mb-1">
                  {renderTagHeader(t.tag, t.color, taggedProfiles.get(t.tag)?.length ?? 0)}
                  {expandedTags.has(t.tag) && (
                    <div className="ml-2">
                      {(taggedProfiles.get(t.tag) ?? []).map((p) => renderProfile(p, false))}
                    </div>
                  )}
                </div>
              ))}
            {/* Untagged section */}
            {untagged.length > 0 && (
              <div className="mb-1">
                {renderTagHeader("Untagged", null, untagged.length, true)}
                {expandedTags.has("__untagged__") && (
                  <div className="ml-2">
                    {untagged.map((p) => renderProfile(p, false))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* New profile button */}
      <div className="p-3 border-t border-border">
        <button onClick={onNew} className="btn-secondary w-full flex items-center justify-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span>New Profile</span>
        </button>
      </div>
    </div>
  );
}
