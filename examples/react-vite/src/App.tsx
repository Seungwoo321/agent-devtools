import { useState, type FormEvent, type JSX } from 'react';
import { OrderSummary } from './checkout/OrderSummary.js';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

const SAMPLE_USERS: User[] = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 2, name: 'Alan Turing', email: 'alan@example.com', role: 'editor' },
  { id: 3, name: 'Grace Hopper', email: 'grace@example.com', role: 'editor' },
  { id: 4, name: 'Linus Torvalds', email: 'linus@example.com', role: 'viewer' },
];

export function App(): JSX.Element {
  const [count, setCount] = useState(0);
  const [submitted, setSubmitted] = useState<string | null>(null);

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitted(`${String(data.get('displayName') ?? '')} (${String(data.get('handle') ?? '')})`);
  }

  return (
    <main>
      <h1>agent-devtools example</h1>
      <p className="lead">
        Open the launcher button in the bottom-right corner, pick an element with the picker, type a
        question, and watch the streamed response.
      </p>

      <OrderSummary />

      <Counter
        count={count}
        onIncrement={() => setCount((n) => n + 1)}
        onReset={() => setCount(0)}
      />

      <UserTable users={SAMPLE_USERS} />

      <ProfileCard onSubmit={handleProfileSubmit} submitted={submitted} />
    </main>
  );
}

interface CounterProps {
  count: number;
  onIncrement: () => void;
  onReset: () => void;
}

function Counter({ count, onIncrement, onReset }: CounterProps): JSX.Element {
  return (
    <section className="card" id="counter-card">
      <h2>Counter</h2>
      <p>Stateful component for verifying picker → component-name reporting.</p>
      <div className="counter">
        <button type="button" onClick={onIncrement}>
          +1
        </button>
        <button type="button" onClick={onReset}>
          reset
        </button>
        <span>
          count: <strong data-testid="counter-value">{count}</strong>
        </span>
      </div>
    </section>
  );
}

interface UserTableProps {
  users: User[];
}

function UserTable({ users }: UserTableProps): JSX.Element {
  return (
    <section className="card" id="user-table-card">
      <h2>Users</h2>
      <p>Tabular data — try picking a single row and asking what role they have.</p>
      <table className="user-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UserRow({ user }: { user: User }): JSX.Element {
  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>{user.role}</td>
    </tr>
  );
}

interface ProfileCardProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitted: string | null;
}

function ProfileCard({ onSubmit, submitted }: ProfileCardProps): JSX.Element {
  return (
    <section className="card" id="profile-card">
      <h2>Profile</h2>
      <p>Form fields are great picker targets — names, labels, and current values are surfaced.</p>
      <form className="profile" onSubmit={onSubmit}>
        <label>
          Display name
          <input name="displayName" defaultValue="Demo User" />
        </label>
        <label>
          Handle
          <input name="handle" defaultValue="@demo" />
        </label>
        <label>
          Bio
          <textarea name="bio" rows={3} defaultValue="Just a sample profile for the picker." />
        </label>
        <button type="submit">Save</button>
      </form>
      {submitted && <p>Last saved: {submitted}</p>}
    </section>
  );
}
