/**
 * union 型の値をすべて並べた配列を返す。値が1つでも欠けると引数の型が合わずにコンパイルが止まる
 * （元の型に値が増えたとき、配列を直し忘れないように）
 */
export function listAllValues<T extends string>() {
  return <const L extends readonly T[]>(
    list: L & ([T] extends [L[number]] ? unknown : never)
  ): L => list;
}
