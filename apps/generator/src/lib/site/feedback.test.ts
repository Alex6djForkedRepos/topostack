import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, createSyntheticSource, generateGeometry } from '@topostack/core';
import { FEEDBACK_TYPES, feedbackLink, feedbackReport, studioFeedbackContext, type FeedbackType } from '$lib/site/feedback';

describe('GitHub feedback', () => {
  it.each(Object.keys(FEEDBACK_TYPES) as FeedbackType[])('round-trips %s reports without injecting URL parameters', (type) => {
    const body = feedbackReport(type, 'Steps: &labels=admin # 湖\nExpected: better detail');
    const link = feedbackLink(type, 'Water & mountains?', body);
    const url = new URL(link.url);
    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/Echo-Foxtrot-Works/topostack/issues/new');
    expect(url.searchParams.get('title')).toBe(`[${FEEDBACK_TYPES[type].prefix}] Water & mountains?`);
    expect(url.searchParams.get('body')).toBe(body);
    expect(url.searchParams.has('labels')).toBe(false);
    expect(link.needsPaste).toBe(false);
  });

  it('omits all diagnostics without explicit context', () => {
    expect(feedbackReport('bug', 'problem')).not.toContain('Diagnostic context');
  });

  it('uses a short link for oversized unicode reports without truncating the copyable body', () => {
    const body = feedbackReport('lake', '湖'.repeat(4000));
    const link = feedbackLink('lake', 'A lake', body);
    expect(link.needsPaste).toBe(true);
    expect(link.url.length).toBeLessThan(500);
    expect(new URL(link.url).searchParams.has('body')).toBe(false);
    expect(body).toContain('湖'.repeat(4000));
  });

  it('captures source bounds separately from selected coordinates and excludes private project content', () => {
    const source = createSyntheticSource(DEFAULT_PROJECT);
    const geometry = generateGeometry(DEFAULT_PROJECT, source);
    const project = { ...DEFAULT_PROJECT, name: 'PRIVATE PROJECT', location: { ...DEFAULT_PROJECT.location, lat: 12, label: 'PRIVATE LABEL' } };
    const context = studioFeedbackContext(project, source, geometry, true);
    const serialized = JSON.stringify(context);
    expect(context.selectedLocation).toMatchObject({ lat: 12 });
    expect(context.preview).toMatchObject({ bounds: source.bounds, selectionChanged: true, sourceKind: 'synthetic' });
    expect(serialized).not.toContain('PRIVATE');
    expect(serialized).not.toContain('markers');
    expect(serialized).not.toContain('customLines');
    expect(serialized).not.toContain('values');
  });
});
