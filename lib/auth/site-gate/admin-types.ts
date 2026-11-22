/** 管理画面の「サイトに入れるアカウント」の API の型（サーバーと画面で共有する） */

export interface GateAllowlistEntry {
  /** DB の行の ID。設定で固定したアドレスだけの行は null */
  id: string | null;
  /** 正規化したアドレス（小文字・ローカル部のドットを除いた形） */
  email: string;
  /** 追加日時（ISO 8601）。設定で固定したアドレスだけの行は null */
  createdAt: string | null;
  /** 設定（GATE_ALWAYS_ALLOWED_EMAILS）で固定している。画面から削除できない */
  isFixed: boolean;
  /** この管理者が今サイトに入るのに使っているアカウント。削除できない */
  isCurrentGateAccount: boolean;
}

export interface GateAllowlistResponse {
  /** 入口が有効か（無効な環境では、この一覧はまだ使われない） */
  gateEnabled: boolean;
  /** DB に置ける件数の上限（固定のアドレスは数えない） */
  maxEntries: number;
  /** 固定のアドレスを先頭に、その後は追加日の新しい順 */
  entries: GateAllowlistEntry[];
}

export interface GateAllowlistAddResponse {
  entry: GateAllowlistEntry;
}
