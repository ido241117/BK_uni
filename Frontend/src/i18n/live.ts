import { isValidElement } from 'react';
import i18n from './index';

/** Any Latin letter with a Vietnamese diacritic (Latin-1 Supplement through Latin Extended Additional). */
export const VIETNAMESE = /[À-ỹ]/;

const cache = new WeakMap<object, unknown>();

/**
 * Live translation for module-level data (label maps, option lists, menu config): returns a proxy whose string
 * values are translated when read, so the data follows the current language without changing any call site.
 * Nested objects/arrays are proxied too; React elements and non-Vietnamese strings pass through unchanged.
 */
export function trLive<T>(value: T): T {
    if (typeof value !== 'object' || value === null || isValidElement(value)) return value;
    const hit = cache.get(value);
    if (hit) return hit as T;
    const proxy = new Proxy(value, {
        get(target, property, receiver) {
            const result: unknown = Reflect.get(target, property, receiver);
            if (typeof result === 'string' && VIETNAMESE.test(result)) return i18n.t(result);
            if (typeof result === 'object' && result !== null) return trLive(result);
            return result;
        },
    });
    cache.set(value, proxy);
    return proxy as T;
}
