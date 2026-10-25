import { useEffect, useRef, useState } from 'react';
import type { Idea } from '@project-room/shared';
import { Icon } from '../../components/Icon';

/** Keeps overflowing topic tabs reachable with dragging, touch, keyboard, and side arrows. */
export function BrainstormTopicTabs({
  topics,
  selectedId,
  onSelect,
  onNew,
}: {
  topics: Idea[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  /** Updates arrow availability after scrolling, topic changes, or panel resizing. */
  const measure = () => {
    const element = track.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
  };

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [topics]);

  useEffect(() => {
    track.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  /** Pages through the topic row while respecting reduced-motion preferences. */
  const scroll = (direction: number) => {
    const element = track.current;
    element?.scrollBy({
      left: direction * element.clientWidth * 0.7,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  return (
    <div className="brainstorm-topic-navigation">
      {(edges.left || edges.right) && (
        <button
          className="brainstorm-topic-scroll previous"
          aria-label="Scroll topics left"
          disabled={!edges.left}
          onClick={() => scroll(-1)}
        >
          <Icon name="chevron" />
        </button>
      )}
      <div
        ref={track}
        className="brainstorm-topics"
        role="tablist"
        aria-label="Brainstorm topics"
        onScroll={measure}
        onPointerDown={(event) => {
          drag.current = null;
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || event.buttons !== 1) return;
          const distance = event.clientX - start.x;
          if (!start.moved && Math.abs(distance) < 6) return;
          start.moved = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.classList.add('dragging');
          event.currentTarget.scrollLeft = start.scroll - distance;
          event.preventDefault();
        }}
        onPointerUp={(event) => event.currentTarget.classList.remove('dragging')}
        onPointerCancel={(event) => {
          drag.current = null;
          event.currentTarget.classList.remove('dragging');
        }}
        onLostPointerCapture={(event) => event.currentTarget.classList.remove('dragging')}
        onClickCapture={(event) => {
          if (event.detail && drag.current?.moved) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const index = topics.findIndex((topic) => topic.id === selectedId);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? topics.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + topics.length) % topics.length;
          const topic = topics[next];
          if (!topic) return;
          event.preventDefault();
          onSelect(topic.id);
          (event.currentTarget.children[next] as HTMLButtonElement).focus();
        }}
      >
        {topics.map((topic) => (
          <button
            key={topic.id}
            role="tab"
            title={topic.title}
            aria-selected={topic.id === selectedId}
            tabIndex={topic.id === selectedId ? 0 : -1}
            className={`brainstorm-topic-tab${topic.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(topic.id)}
          >
            {topic.title}
          </button>
        ))}
      </div>
      {(edges.left || edges.right) && (
        <button className="brainstorm-topic-scroll next" aria-label="Scroll topics right" disabled={!edges.right} onClick={() => scroll(1)}>
          <Icon name="chevron" />
        </button>
      )}
      <button className="brainstorm-topic-tab brainstorm-topic-new" onClick={onNew}>
        <Icon name="plus" /> New topic
      </button>
    </div>
  );
}
