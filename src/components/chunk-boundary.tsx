import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Catches a lazily-loaded screen that refuses to load.
 *
 * {@link lazyChunk} reloads once when a chunk has been deployed away, which
 * covers the ordinary case. This is what's left: a chunk that is genuinely
 * broken, or a reload that didn't help. Without a boundary React unmounts the
 * whole app and leaves a white page, which reads as "the site is down" rather
 * than "this one screen didn't load".
 */
export class ChunkBoundary extends Component<
  { children: ReactNode; what: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('failed to load a screen', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">{this.props.what} didn’t load.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Usually this means the site was updated while this page was open. Reloading picks up
          the new version; nothing you've saved is affected.
        </p>
        <Button size="sm" onClick={() => window.location.reload()}>
          <RefreshCw />Reload the page
        </Button>
      </div>
    );
  }
}
