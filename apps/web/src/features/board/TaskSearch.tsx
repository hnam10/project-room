import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useSnapshot } from '../../state/workspace';
import { STATUS_COLUMNS } from './groups';
import { highlightParts, keywordsOf, searchTasks } from './search';

const MAX_RESULTS = 8;

/** Top-bar task search: matches show in a dropdown while typing; picking one opens the task on the board. */
export function TaskSearch() {
  const { tasks, members } = useSnapshot();
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const keywords = keywordsOf(query);
  const matches = searchTasks(tasks, members, keywords);
  const shown = matches.slice(0, MAX_RESULTS);
  const expanded = open && keywords.length > 0;
  const activeIndex = Math.min(active, shown.length - 1);

  const pick = (task: Task) => {
    setQuery('');
    setOpen(false);
    navigate(`board?task=${encodeURIComponent(task.id)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (expanded) setOpen(false);
      else setQuery('');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (shown.length) setActive((activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === 'Enter' && expanded && shown[activeIndex]) {
      e.preventDefault();
      pick(shown[activeIndex]);
    }
  };

  return (
    <div className="search-box">
      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search tasks…"
          autoComplete="off"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && shown.length ? `${listId}-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>
      {expanded && (
        <div className="search-results">
          <ul id={listId} role="listbox" aria-label="Matching tasks">
            {shown.map((task, i) => {
              const status = STATUS_COLUMNS.find((c) => c.id === task.status);
              return (
                <li
                  key={task.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`search-result${i === activeIndex ? ' active' : ''}`}
                  // Keep focus in the input so blur doesn't close the list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(task)}
                >
                  <span className="task-num">#{task.num}</span>
                  <span className={`search-result-title${task.status === 'done' ? ' done-title' : ''}`}>
                    {highlightParts(task.title, keywords).map((part, j) => (part.match ? <mark key={j}>{part.text}</mark> : part.text))}
                  </span>
                  <span className="search-result-status" style={{ '--c': status?.color } as React.CSSProperties}>
                    {status?.label ?? task.status}
                  </span>
                  <Avatar member={members.find((m) => m.id === task.assigneeId)} />
                </li>
              );
            })}
          </ul>
          {!shown.length && <p className="search-empty">No tasks match “{query.trim()}”</p>}
          {matches.length > shown.length && <p className="search-more">{matches.length - shown.length} more — refine your search</p>}
        </div>
      )}
    </div>
  );
}
