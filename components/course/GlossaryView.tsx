'use client';
import { useState } from 'react';
import { VocabEntry } from '@/types/curriculum';
import RichText from '@/components/ui/RichText';

export default function GlossaryView({ entries }: { entries: VocabEntry[] }) {
  const [search, setSearch] = useState('');
  const filtered = entries.filter(e =>
    e.term.toLowerCase().includes(search.toLowerCase())
  );

  // Group by first letter
  const grouped: Record<string, VocabEntry[]> = {};
  filtered.forEach(entry => {
    const letter = entry.term[0]?.toUpperCase() ?? '#';
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(entry);
  });

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Glossary</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {entries.length} term{entries.length !== 1 ? 's' : ''}
        </p>
        <input
          type="text"
          placeholder="Search terms..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px 14px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          No terms match &quot;{search}&quot;
        </p>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([letter, items]) => (
          <div key={letter} style={{ marginBottom: '28px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: '700',
              color: 'var(--accent-primary)',
              padding: '4px 0',
              borderBottom: '2px solid var(--accent-primary)',
              marginBottom: '12px',
              width: '28px',
              textAlign: 'center',
            }}>
              {letter}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((entry, i) => (
                <div key={i} style={{
                  padding: '14px 16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      fontWeight: '700',
                      color: 'var(--accent-primary)',
                      marginBottom: '6px',
                    }}>
                      {entry.term}
                    </p>
                    {entry.subject_context && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        padding: '2px 6px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '2px',
                      }}>
                        {entry.subject_context}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <RichText content={entry.definition} />
                  </div>
                  {entry.also_known_as && entry.also_known_as.length > 0 && (
                    <p style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Also: {entry.also_known_as.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
