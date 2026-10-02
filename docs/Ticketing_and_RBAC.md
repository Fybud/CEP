# Ticketing & Role-Based Access Control (RBAC)

This document explains exactly how the ticketing system works in conjunction with the RBAC (Role-Based Access Control) hierarchy, outlining what each role is permitted to see and do.

---

## The Ticketing Philosophy
1. **One Issue = One Ticket**: Any customer problem requiring follow-up, cross-team collaboration, or background work should be converted into a ticket.
2. **Strict Silos**: Users should only see the tickets they need to see. Information overload is prevented by hard-scoping visibility.
3. **Escalation Path**: If an Agent cannot resolve a ticket, they escalate it. Escalating a ticket removes it from the Agent's view and hands it over to Management.

---

## Role Definitions & Ticketing Permissions

### 1. 👑 Super Admin
**Who they are**: The highest level of authority in the organization (typically founders or IT Directors).

**What they can do**:
- **User Management**: Create, edit, and delete *any* role (including other Super Admins).
- **Team Management**: Create, edit, and delete any teams. Assign anyone to any team.
- **Ticketing Power**: 
  - View every single ticket across the entire organization.
  - Reassign any ticket to any user or team.
  - Change ticket statuses (including closing or resolving).
  - Add internal notes to any ticket.
  - Review and resolve all tickets in the "Escalated" queue.

---

### 2. 🛡️ Admin
**Who they are**: Organizational operators who manage the day-to-day structure but do not have root system access.

**What they can do**:
- **User Management**: Create, edit, and delete Managers and Agents. *Cannot* create or edit Super Admins or peer Admins.
- **Team Management**: Create, edit, and delete any teams.
- **Ticketing Power**: 
  - View every single ticket across the entire organization.
  - Reassign any ticket to any user or team.
  - Review and resolve all tickets in the "Escalated" queue.
  - *Essentially the same ticketing powers as a Super Admin.*

---

### 3. 👔 Manager
**Who they are**: Team leads responsible for a specific department (e.g., L1 Support Manager, Billing Manager).

**What they can do**:
- **User Management**: Can view the agents within their assigned team, but *cannot* create or edit users.
- **Team Management**: Cannot create or modify teams.
- **Ticketing Power**:
  - View all tickets assigned to their **specific team**. *Cannot* see tickets assigned to other teams.
  - Reassign tickets between Agents *within their team*.
  - Resolve tickets on behalf of their agents.
  - Receive and review tickets escalated by their team's Agents.
  - Escalate tickets further up to Admins if necessary.

---

### 4. 🎧 Agent
**Who they are**: The front-line workers handling direct customer communication.

**What they can do**:
- **User & Team Management**: None. Can only view their own team members.
- **Ticketing Power**:
  - View tickets that are **explicitly assigned to them**.
  - View "Unassigned" tickets that belong to their team (so they can claim them).
  - Update the status of their tickets (e.g., OPEN -> RESOLVED).
  - Add internal notes to their tickets.
- **Escalation Limitations**:
  - Agents can mark a ticket as `ESCALATED` (must provide a reason/note).
  - **Rule**: Once an Agent escalates a ticket, they *lose visibility* of it. It disappears from their dashboard until a Manager or Admin returns it to them. Agents cannot assign tickets to other teams or users.

---

## Typical Ticketing Workflows

### Scenario A: Standard Resolution
1. **Agent** claims an unassigned ticket from their team's queue.
2. **Agent** communicates with the customer via the Unified Inbox and adds internal notes to the ticket.
3. The issue is fixed. **Agent** changes the ticket status to `RESOLVED`.

### Scenario B: Escalation
1. **Agent** receives a difficult billing ticket. They don't have access to the billing system.
2. **Agent** clicks "Escalate", adds a note ("Need a refund issued for invoice #123"), and confirms.
3. The ticket vanishes from the **Agent's** view.
4. The **Manager** sees the escalated ticket in their dashboard. 
5. The **Manager** issues the refund, adds a note ("Refund issued"), and clicks "Return to Agent".
6. The ticket reappears on the **Agent's** dashboard for them to inform the customer and close the ticket.
