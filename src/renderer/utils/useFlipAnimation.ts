import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// FLIP animation for grid children marked with data-flip-key: when the list changes, moved items
// slide from their old position to the new one (wrapping to the next row) and new items pop in.
// Positions are layout offsets inside the container (it must be position: relative), so scrolling
// and running transforms do not affect them.

const MOVE_DURATION_MS = 450;
const ENTER_DURATION_MS = 350;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

type Position = { x: number; y: number };

// Returns a callback ref for the grid container
export const useFlipAnimation = (deps: unknown[]) => {
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const positions = useRef(new Map<string, Position>());
    const initialized = useRef(false);

    const measure = (container: HTMLElement) => {
        const result = new Map<string, { el: HTMLElement; pos: Position }>();
        container.querySelectorAll<HTMLElement>(':scope > [data-flip-key]').forEach(el => {
            result.set(el.dataset.flipKey!, { el, pos: { x: el.offsetLeft, y: el.offsetTop } });
        });
        return result;
    };

    useLayoutEffect(() => {
        if (!container) return;

        const current = measure(container);
        const isVisible = (rect: DOMRect, dy = 0) => rect.bottom + dy > 0 && rect.top + dy < window.innerHeight;

        if (initialized.current) {
            current.forEach(({ el, pos }, key) => {
                // An update during a running animation restarts it from the stored position
                el.getAnimations().forEach(animation => animation.cancel());
                const rect = el.getBoundingClientRect();

                const prev = positions.current.get(key);
                if (!prev) {
                    if (isVisible(rect)) {
                        el.animate(
                            [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }],
                            { duration: ENTER_DURATION_MS, easing: EASING, delay: MOVE_DURATION_MS / 3, fill: 'backwards' }
                        );
                    }
                    return;
                }

                const dx = prev.x - pos.x;
                const dy = prev.y - pos.y;
                if (!dx && !dy) return;
                // Skip items that are off screen both before and after the move
                if (!isVisible(rect) && !isVisible(rect, dy)) return;

                el.animate(
                    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
                    { duration: MOVE_DURATION_MS, easing: EASING }
                );
            });
        }

        positions.current = new Map(Array.from(current, ([key, { pos }]) => [key, pos]));
        initialized.current = current.size > 0;
    }, [container, ...deps]);

    // Column count changes on resize: remember the new layout without animating it
    useEffect(() => {
        if (!container) return;
        const observer = new ResizeObserver(() => {
            positions.current = new Map(Array.from(measure(container), ([key, { pos }]) => [key, pos]));
        });
        observer.observe(container);
        return () => {
            observer.disconnect();
            // The grid was unmounted (e.g. empty list): its next appearance is not animated
            initialized.current = false;
            positions.current = new Map();
        };
    }, [container]);

    return setContainer;
};
