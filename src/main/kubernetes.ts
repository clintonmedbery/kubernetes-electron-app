import { ipcMain } from 'electron';
import * as net from 'net';
import {
  KubeConfig,
  V1Deployment,
  AppsV1Api,
  PortForward,
  CoreV1Api,
} from '@kubernetes/client-node';
import { Deployment, Status } from '../models/deployments';

const kc = new KubeConfig();
kc.loadFromDefault();

const k8sAppsClient = kc.makeApiClient(AppsV1Api);
const coreClient = kc.makeApiClient(CoreV1Api);

const getDeploymentStatus = (deployment: V1Deployment): Status => {
  const { status } = deployment;
  if (!status || status.availableReplicas === undefined) {
    return Status.Unknown;
  }
  if (status.unavailableReplicas) {
    return Status.Unavailable;
  }
  if (status.availableReplicas === status.replicas) {
    return Status.Available;
  }

  return Status.Unknown;
};

const getDeployments = async () => {
  const response = await k8sAppsClient.listNamespacedDeployment('kommander');
  const deployments: Deployment[] = response.body.items.map(
    (x: V1Deployment) => {
      return {
        name: x.metadata?.name,
        image: x.spec?.template?.spec?.containers[0].image,
        replicas: x.status?.replicas ?? 0,
        status: getDeploymentStatus(x),
      };
    },
  );
  return deployments;
};

ipcMain.on('requestDeployments', async (event) => {
  const deployments = await getDeployments();
  event.sender.send('receiveDeployments', deployments);
});

ipcMain.on(
  'createDeployment',
  async (event, imageName: string, deploymentName: string) => {
    const newDeployment = {
      metadata: {
        name: deploymentName,
      },
      spec: {
        selector: {
          matchLabels: {
            app: deploymentName,
            env: 'dev',
          },
        },
        replicas: 1,
        template: {
          metadata: {
            labels: {
              app: deploymentName,
              env: 'dev',
            },
          },
          spec: {
            containers: [
              {
                name: deploymentName,
                image: imageName,
              },
            ],
          },
        },
      },
    };
    try {
      await k8sAppsClient.createNamespacedDeployment('default', newDeployment);
      const deployments = await getDeployments();
      event.sender.send('receiveDeployments', deployments);
    } catch (error) {
      console.error(error);
    }
  },
);

ipcMain.on('portForward', async (_, deploymentName: string) => {
  try {
    await coreClient.createNamespacedService('default', {
      metadata: {
        name: `${deploymentName}-service`,
      },
      spec: {
        type: 'LoadBalancer',
        selector: {
          app: deploymentName,
        },
        ports: [
          {
            targetPort: 3000,
            port: 3000,
            nodePort: 30008,
          },
        ],
      },
    });

    const forward = new PortForward(kc);

    // This simple server just forwards traffic from itself to a service running in kubernetes
    // -> localhost:8080 -> port-forward-tunnel -> kubernetes-pod
    // This is basically equivalent to 'kubectl port-forward ...' but in TypeScript.
    const server = net.createServer((socket) => {
      forward.portForward(
        'default',
        `${deploymentName}-service`,
        [3003],
        socket,
        null,
        socket,
      );
    });

    server.listen(3003, '127.0.0.1');
  } catch (error) {
    console.error(error);
  }
});
