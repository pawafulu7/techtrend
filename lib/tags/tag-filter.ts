/**
 * 記事一覧のタグ絞り込みの上限（#681）。API の検証と、タグを選ぶ UI の両方で使う
 */

/** 一度に絞り込めるタグの数。AND では名前ごとに条件が増えるので、負荷の歯止めにする */
export const MAX_TAG_FILTER_COUNT = 50;

/** 絞り込みに使えるタグ名の長さ（既存のタグ名は最長 283 文字） */
export const MAX_TAG_NAME_LENGTH = 300;
