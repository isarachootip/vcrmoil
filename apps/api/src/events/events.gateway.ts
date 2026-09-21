import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AgentStatus } from '@vcrm/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Socket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('agent:status')
  handleAgentStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { status: AgentStatus },
  ): { event: string; data: { status: AgentStatus; receivedAt: string } } {
    this.logger.debug(`Agent ${client.id} changed status to ${data.status}`);
    return {
      event: 'agent:status:ack',
      data: {
        status: data.status,
        receivedAt: new Date().toISOString(),
      },
    };
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
