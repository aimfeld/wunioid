// The PixiJS application both pictures draw into (Classic and Remastered, one shown at a time).

import { Application } from 'pixi.js';

export async function createApp(parent: HTMLElement): Promise<Application> {
  const app = new Application();
  // autoStart off: the game loop renders once per animation frame, after the ticks
  await app.init({ resizeTo: window, background: '#000000', antialias: false, autoDensity: true,
    resolution: window.devicePixelRatio || 1, autoStart: false });
  parent.appendChild(app.canvas);
  return app;
}
