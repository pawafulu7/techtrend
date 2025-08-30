export class ProgressBar {
  private current: number = 0;
  private barLength: number = 40;
  
  constructor(private total: number, private label: string = '進捗') {}
  
  update(current: number, extraInfo?: string) {
    this.current = current;
    const percentage = Math.round((current / this.total) * 100);
    const filled = Math.round(this.barLength * (current / this.total));
    const empty = this.barLength - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const info = extraInfo ? ` - ${extraInfo}` : '';
    
    process.stdout.write(`\r${this.label}: [${bar}] ${percentage}% (${current}/${this.total})${info}`);
  }
  
  increment(extraInfo?: string) {
    this.update(this.current + 1, extraInfo);
  }
  
  complete(_message?: string) {
    this.update(this.total);
  }
  
  clear() {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
}