import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildExternalLinksJson } from "@/lib/external-links";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("TicketPulse123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ticketpulse.local" },
    update: {},
    create: {
      name: "Ticket Pulse Admin",
      email: "admin@ticketpulse.local",
      passwordHash: adminPassword,
      role: "ADMIN",
      notificationPreference: {
        create: {
          email: "admin@ticketpulse.local",
          immediateAlerts: true,
          weeklyDigest: true,
          emailNotifications: true
        }
      }
    }
  });

  const ticket = await prisma.trackedTicket.upsert({
    where: { id: "demo-ticket-1" },
    update: {},
    create: {
      id: "demo-ticket-1",
      ownerId: admin.id,
      supportTicketId: "4-0002701146",
      bugId: "39342735",
      jiraId: "OFCL-35376",
      title: "Intermittent export failure during month close",
      notes: "Demo ticket seeded for dashboard validation.",
      priority: "HIGH",
      status: "IN PROGRESS",
      assignee: "Priya Nair",
      currentRisk: "HIGH",
      lastSyncedAt: new Date(),
      externalLinks: buildExternalLinksJson({
        supportTicketId: "4-0002701146",
        bugId: "39342735",
        jiraId: "OFCL-35376"
      })
    }
  });

  await prisma.pollingJob.upsert({
    where: { jobKey: `ticket:${ticket.id}` },
    update: {},
    create: {
      ticketId: ticket.id,
      jobKey: `ticket:${ticket.id}`,
      intervalMinutes: 30,
      status: "ACTIVE",
      nextRunAt: new Date()
    }
  });

  await prisma.ticketEvent.create({
    data: {
      ticketId: ticket.id,
      system: "JIRA",
      eventType: "STATUS_CHANGED",
      changedField: "status",
      previousValue: "OPEN",
      newValue: "IN PROGRESS",
      message: "Jira issue moved from OPEN to IN PROGRESS"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });


