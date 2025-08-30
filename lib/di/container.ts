import { IDIContainer } from './types';

class DIContainer implements IDIContainer {
  private providers = new Map<symbol, () => unknown>();
  private singletons = new Map<symbol, unknown>();

  get<T>(token: symbol): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    const provider = this.providers.get(token);
    if (!provider) {
      throw new Error(`No provider registered for token: ${token.toString()}`);
    }

    return provider() as T;
  }

  register<T>(token: symbol, provider: () => T): void {
    this.providers.set(token, provider);
  }

  registerSingleton<T>(token: symbol, provider: () => T): void {
    if (!this.singletons.has(token)) {
      this.singletons.set(token, provider());
    }
  }

  reset(): void {
    this.providers.clear();
    this.singletons.clear();
  }
}

export const container = new DIContainer();
