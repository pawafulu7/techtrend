/**
 * 一覧のツールバー（ホーム・リーダー・論文）の操作部品の大きさと枠
 *
 * 部品ごとに 24〜32px・12〜14px とばらついていたのを、1つにそろえる。
 * 押しやすさのため、デスクトップ（lg 以上）より狭い幅では一段大きくする。
 * 枠は一段濃い線にして、白い面の上でも輪郭が分かるようにする（選ばれている塗りのボタンには付けない）。
 *
 * ButtonV2 の sm は、アイコンを直下に持つボタンだけ `has-[>svg]:px-2.5` で余白を詰める。
 * `:has()` の分だけ詳細度が高く、呼び出し側の px / p では消えないので、同じ書き方で上書きする。
 */
export const TOOLBAR_CONTROL = 'h-9 text-sm lg:h-8 has-[>svg]:px-3';
export const TOOLBAR_ICON_BUTTON = 'h-9 w-9 p-0 lg:h-8 lg:w-8 has-[>svg]:p-0';
export const TOOLBAR_OUTLINE = 'border-(--tt-color-border-hover)';
