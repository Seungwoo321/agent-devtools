import { useEffect, useState } from 'react';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://jsonplaceholder.typicode.com/todos', { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Todo[]) => setTodos(data.slice(0, 10)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      });
    return () => controller.abort();
  }, []);

  if (!todos) return <p>Loading…</p>;

  return (
    <>
      <h2>Todos (jsonplaceholder)</h2>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input type="checkbox" defaultChecked={todo.completed} disabled />
            {todo.title}
          </li>
        ))}
      </ul>
    </>
  );
}
