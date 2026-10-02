export type Scene = {
  id: string;
  title: string;
  description: string | null;
  video_path: string;
  bg_audio_path: string | null;
  original_volume: number;
  duration: number | null;
  created_by: string | null;
  created_at: string;
  tags?: string[];
  thumb_path?: string | null;
  dub_count?: number;
};

export type SceneRole = {
  id: string;
  scene_id: string;
  name: string;
  color: string;
  sort: number;
};

export type SceneLine = {
  id: string;
  scene_id: string;
  role_id: string;
  start_time: number;
  end_time: number;
  text: string | null;
};

export type SceneFull = Scene & { scene_roles: SceneRole[]; scene_lines: SceneLine[]; creator?: ProfileLite | null };

/** Sahne + yapımcı select'i (005 gerekir) */
export const SCENE_FULL_SELECT = "*, scene_roles(*), scene_lines(*), creator:profiles(username, display_name, color, avatar_path)";

export type RoomStatus = "lobby" | "writing" | "recording" | "finale";
export type GameMode = "klasik" | "zincir" | "senarist" | "duello" | "kulak" | "kim" | "efekt" | "duygu" | "hikaye";
export type GameMod = "kart" | "hain" | "foley";

export type Room = {
  id: string;
  code: string;
  /** Kulaktan kulağa odaları sahnesiz olabilir */
  scene_id: string | null;
  host_id: string;
  status: RoomStatus;
  finale_at: string | null;
  current_dub_id?: string | null;
  locked?: boolean;
  banned?: string[];
  mode?: GameMode;
  mods?: GameMod[];
  mode_state?: {
    order?: string[];
    players?: string[];
    champion?: string;
    round?: number;
    rounds?: number;
    game?: string | null;
    /** parti modları: record | answer | reveal */
    phase?: "record" | "answer" | "reveal";
    prompt?: string;
    turn?: number;
    turns?: number;
    topic?: string;
  };
  foley_user?: string | null;
  /** Açık lobi: Aktif odalar listesinde görünür (010) */
  is_public?: boolean;
  created_at: string;
};

export type RoomPlayer = {
  room_id: string;
  user_id: string;
  nickname: string;
  done: boolean;
  joined_at: string;
  /** useRoom profilden ekler */
  color?: string;
  avatar_path?: string | null;
  username?: string;
  voice_path?: string | null;
  equipped?: Equipped;
  /** Realtime Presence: sayfası şu an açık mı (bilinmiyorsa undefined) */
  online?: boolean;
};

/** Mağazadan takılan kozmetikler */
export type Equipped = { frame?: string; name?: string; plaque?: string; sound?: string; banner?: string };

export type RoomRole = { room_id: string; role_id: string; user_id: string; picked: boolean };

export type Recording = {
  id: string;
  room_id: string;
  line_id: string;
  user_id: string;
  audio_path: string;
  offset_time: number;
  effect?: string;
};

export const ROLE_COLORS = ["#ff7a1a", "#38bdf8", "#a3e635", "#f472b6", "#c084fc", "#facc15", "#2dd4bf"];
export const MAX_ROLES = 7;

export function sortLines(lines: SceneLine[]) {
  return [...lines].sort((a, b) => a.start_time - b.start_time);
}

export function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00.0";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
}

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  color: string;
  xp: number;
  streak: number;
  best_streak: number;
  last_streak_day: string | null;
  avatar_path: string | null;
  banner_path?: string | null;
  voice_path?: string | null;
  equipped?: Equipped;
  spent?: number;
  /** Profil vitrini: en fazla 3 dublaj / oyun */
  showcase?: ShowcaseItem[];
  created_at: string;
};

export type ShowcaseItem = { t: "dub" | "kulak" | "parti"; id: string };

export type ProfileLite = Pick<Profile, "username" | "display_name" | "color"> & { avatar_path?: string | null; equipped?: Equipped };

/** PostgREST select'lerinde profil alanları */
export const PROFILE_LITE = "username, display_name, color, avatar_path, equipped";

/** list_scenes() satırı */
export type SceneListItem = {
  id: string;
  title: string;
  description: string | null;
  video_path: string;
  thumb_path: string | null;
  duration: number | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  dub_count: number;
  week_dubs: number;
  role_count: number;
  line_count: number;
  roles: { id: string; name: string; color: string }[];
  creator: ProfileLite | null;
};

export type Dub = {
  id: string;
  mode?: GameMode;
  mods?: GameMod[];
  chain?: string[] | null;
  has_impostor?: boolean;
  room_id: string | null;
  scene_id: string;
  created_by: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
};

export type DubComment = {
  id: string;
  dub_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: ProfileLite | null;
};
