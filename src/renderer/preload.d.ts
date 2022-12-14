import { Channels } from 'main/preload';
import { Deployment } from 'models/deployments';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        requestDeployments(): void;
        receiveDeployments(
          func: (deployments: Deployment[]) => void,
        ): (() => void) | undefined;
        createDeployment(imageName: string, deploymentName: string): void;
        portForward(deploymentName: string): void;
        sendMessage(channel: string, args: unknown[]): void;
        on(
          channel: string,
          func: (...args: unknown[]) => void,
        ): (() => void) | undefined;
        once(channel: string, func: (...args: unknown[]) => void): void;
      };
    };
  }
}

export {};
