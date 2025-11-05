import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { vscodeTheme } from '../../theme/vscode-theme';

export interface VirtualizedListItem {
  id: string;
  height?: number;
  data: any;
}

export interface VirtualizedListProps<T extends VirtualizedListItem> {
  items: T[];
  itemHeight?: number; // Fixed height for all items
  estimatedItemHeight?: number; // For variable height items
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number; // Number of items to render outside visible area
  className?: string;
  onScroll?: (scrollTop: number) => void;
  onEndReached?: () => void; // Called when user scrolls near the end
  endThreshold?: number; // Distance from end to trigger onEndReached
}

export const VirtualizedList = <T extends VirtualizedListItem>({
  items,
  itemHeight = 40,
  estimatedItemHeight = 40,
  containerHeight,
  renderItem,
  overscan = 5,
  className,
  onScroll,
  onEndReached,
  endThreshold = 200
}: VirtualizedListProps<T>) => {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const { startIndex, endIndex, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const offsetY = startIndex * itemHeight;

    return { startIndex, endIndex, totalHeight, offsetY };
  }, [items.length, itemHeight, scrollTop, containerHeight, overscan]);

  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1);
  }, [items, startIndex, endIndex]);

  // Handle scroll
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = event.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);

    // Check if we're near the end
    const scrollHeight = event.currentTarget.scrollHeight;
    const clientHeight = event.currentTarget.clientHeight;
    const distanceFromBottom = scrollHeight - newScrollTop - clientHeight;

    if (distanceFromBottom < endThreshold && onEndReached) {
      onEndReached();
    }
  }, [onScroll, onEndReached, endThreshold]);

  // Auto-scroll to maintain position when items change
  useEffect(() => {
    if (scrollElementRef.current) {
      const currentScrollTop = scrollElementRef.current.scrollTop;
      const maxScrollTop = Math.max(0, totalHeight - containerHeight);

      if (currentScrollTop > maxScrollTop) {
        scrollElementRef.current.scrollTop = maxScrollTop;
      }
    }
  }, [totalHeight, containerHeight]);

  return (
    <div
      ref={scrollElementRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative'
      }}
      onScroll={handleScroll}
    >
      {/* Total height spacer */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible items container */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={item.id}
              style={{
                height: itemHeight,
                position: 'relative'
              }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Memoized version for better performance
export const MemoizedVirtualizedList = React.memo(VirtualizedList) as typeof VirtualizedList;
