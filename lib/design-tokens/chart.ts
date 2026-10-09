import { lightColors } from './colors';
import { slate, white } from './palette';

/**
 * Chart Colors - チャートの系列色
 *
 * 系列（タグ・ソースなど）を見分けるための色。状態色（positive / warning など）とは別に持ち、
 * 状態色の調整がチャートに波及しないようにする。塗りに文字を載せるときは
 * lib/utils/design-tokens/contrast.ts の readableTextColor で文字色を選ぶ。
 */
export const chartColors = {
  light: [
    '#2563EB', // blue-600
    '#059669', // emerald-600
    '#EA580C', // orange-600
    '#DC2626', // red-600
    '#7C3AED', // violet-600
    '#DB2777', // pink-600
    '#0891B2', // cyan-600
    '#D97706', // amber-600
    '#4F46E5', // indigo-600
    '#0D9488', // teal-600
  ],
  dark: [
    '#60A5FA', // blue-400
    '#34D399', // emerald-400
    '#FB923C', // orange-400
    '#F87171', // red-400
    '#A78BFA', // violet-400
    '#F472B6', // pink-400
    '#22D3EE', // cyan-400
    '#FBBF24', // amber-400
    '#818CF8', // indigo-400
    '#2DD4BF', // teal-400
  ],
} as const satisfies Record<'light' | 'dark', readonly string[]>;

/** チャートの塗りに載せる文字の候補（readableTextColor で塗りごとに選ぶ） */
export const chartLabelTextColors = [white, slate[950]] as const;

/**
 * 記事グラフ（/articles/[id]/graph）のノードの色
 *
 * キャンバスは常に暗い配色で描く。サーバー（lib/graph/node-transformer.ts と
 * relationship-graph API）が nodes[].color に入れ、画面の凡例も同じ値を使う。
 */
export const graphNodeColors = {
  center: '#FBBF24', // amber-400
  category: {
    Frontend: '#4F46E5', // indigo-600
    Backend: '#10B981', // emerald-500
    'AI/ML': '#F59E0B', // amber-500
    DevOps: '#8B5CF6', // violet-500
    Database: '#06B6D4', // cyan-500
    Security: '#EF4444', // red-500
    Testing: '#EC4899', // pink-500
    Other: slate[500],
  },
} as const;

/**
 * 変化率の色（減少 → 横ばい → 増加）。セクターマップのタイルを、この3色の間を補間して塗る
 *
 * タイルの上には changeScaleTextColor の文字を載せる。補間した途中の色も含めて
 * AA を満たすことを contrast.test.ts で確かめている。
 */
export const changeScaleColors = [
  lightColors.negative,
  lightColors.textMuted,
  lightColors.positive,
] as const;

export const changeScaleTextColor = white;
