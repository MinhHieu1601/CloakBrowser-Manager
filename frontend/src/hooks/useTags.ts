import { useCallback, useEffect, useState } from "react";
import { api, type TagInfo } from "../lib/api";

export function useTags() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listTags();
      setTags(data);
    } catch {
      // silently fail — tags are supplementary
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateTag = useCallback(
    async (tagName: string, data: { new_name?: string; color?: string | null }) => {
      try {
        const updated = await api.updateTag(tagName, data);
        setTags(updated);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteTag = useCallback(
    async (tagName: string) => {
      try {
        await api.deleteTag(tagName);
        setTags((prev) => prev.filter((t) => t.tag !== tagName));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return { tags, loading, refresh, updateTag, deleteTag };
}
