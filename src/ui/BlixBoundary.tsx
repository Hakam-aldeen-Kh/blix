"use client";

import { Component, type ReactNode } from "react";

/**
 * The line between Blix and the app it is mounted in.
 *
 * `<Blix />` renders inside the host's React tree, so without this an error
 * thrown while the panel renders — a bug in Blix, a stored preference of a
 * shape this build does not expect, a panel chunk that failed to download —
 * travels up to the host's nearest error boundary and takes that part of the
 * app with it. Usually that is the root layout: a devtool that white-screens
 * the thing it was installed to debug.
 *
 * Caught here instead, the panel goes away and the app carries on. It stays
 * away until a reload: rendering it again would only throw again, and a
 * devtool that flickers in and out is worse than one that is plainly absent.
 * It says so exactly once, on the console, which is where a developer looks
 * when the launcher is not where it was.
 *
 * No fallback UI on purpose — there is nothing here a user of the host app
 * should ever see.
 */
export class BlixBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[blix] the panel crashed and is disabled until reload:", error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
