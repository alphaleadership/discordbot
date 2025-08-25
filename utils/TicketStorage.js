import fs from 'fs';
import path from 'path';

export class TicketStorage {
    constructor(filePath = 'data/tickets.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.ensureFileExists();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, '{}', 'utf-8');
        }
    }

    async readTickets() {
        try {
            const data = await fs.promises.readFile(this.filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Erreur lors de la lecture des tickets:', error);
            return {};
        }
    }

    async writeTickets(tickets) {
        try {
            await fs.promises.writeFile(
                this.filePath, 
                JSON.stringify(tickets, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('Erreur lors de l\'écriture des tickets:', error);
        }
    }

    async createTicket(userId, threadId, channelId) {
        const tickets = await this.readTickets();
        tickets[userId] = {
            threadId,
            channelId,
            createdAt: new Date().toISOString(),
            status: 'open'
        };
        await this.writeTickets(tickets);
        return tickets[userId];
    }

    async getTicket(userId) {
        const tickets = await this.readTickets();
        return tickets[userId] || null;
    }

    async updateTicket(userId, updates) {
        const tickets = await this.readTickets();
        if (tickets[userId]) {
            tickets[userId] = { ...tickets[userId], ...updates };
            await this.writeTickets(tickets);
            return tickets[userId];
        }
        return null;
    }

    async closeTicket(userId) {
        return this.updateTicket(userId, { 
            status: 'closed',
            closedAt: new Date().toISOString()
        });
    }

    async deleteTicket(userId) {
        const tickets = await this.readTickets();
        if (tickets[userId]) {
            const ticket = tickets[userId];
            delete tickets[userId];
            await this.writeTickets(tickets);
            return ticket;
        }
        return null;
    }
}
