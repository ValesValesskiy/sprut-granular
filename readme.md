<br>
<br>
<p align="center"><img src="./icon.svg" width="150"></p>
<br>
<br>

```bash
> npm i sprut-granular
```

> ⚠️ **Внимание:**
> Инструмент тестируется и будет дописываться или переписываться.
> До версии `1.0.0` интерфейсы некоторых методов могут отличаться от релиза к релизу.
> Прошу понять и простить.

# Sprut-granular

Инструмент управления состоянием данных.
Упрощает слежение за изменениями данных и создание реакции на изменения. Предоставляет обёртки для примитивных данных, объектов и массивов, а также инструменты для настройки подписок, игнорирования, частичных подписок и асинхронных цепочек.

---

<br>

## <span id="contents">Оглавление</span>

- [Быстрое использование](#fast)
- [Реактивные коробки - reactiveCell](#reactive)
- [Вычисляющие коробки - computedCell](#computed)
- [Работа с объектами](#objects)
- [Ключи инвалидации при объявлении computedCell (статические)](#staticKeyDescriptors)
- [Ключи инвалидации при чтении через get(comparableKeys) (динамические)](#dynamicKeyDescriptors)
- [Работа с массивами, слои преобразования, работа с элементами массива](#arrays)
- [Слои преобразования массива](#arrayReducers)
- [Работа с элементами массива](#arrayItems)
- [Асинхронные вызовы в computed - asyncStacking / asyncStackedAction / pipe](#async)
- [Реактивные действия - actionCell](#action)
- [Событийные триггеры, провокаторы - eventCell](#event)
- [Очистка от зависимостей и слушателей](#dissociate)
- [Метод, модификатор поведения - hushGet](#hushGet)
- [Утилиты isReactiveCell, isReactiveArrayCell](#utils)
- [Таймаут функция](#timeout)
- [Средства разработчика и дебаг](#devTools)

<br>

## <span id="fast">Быстрое использование:</span>

- [К оглавлению](#contents)

<br>

Все ячейки создаются внутри изолированного контекста графа реактивности через `createStateMachine()`:

```ts
import { createStateMachine } from 'sprut-granular';

const { reactiveCell, computedCell, actionCell } = createStateMachine();

const count = reactiveCell(1);
const doubled = computedCell(() => count.get() * 2);

const run = actionCell(() => {
  console.log('doubled =', doubled.get());
});

// Первый вызов собирает зависимости и выполняет действие
run(); // doubled = 2

count.set(5); // doubled = 10
```

<br>

## <span id="reactive">Реактивные коробки - reactiveCell:</span>

- [К оглавлению](#contents)

<br>

`reactiveCell(initialValue, options?)` оборачивает значение в реактивный контейнер с методами `.get()`, `.set()` и `.hushGet()`.

```ts
const { reactiveCell } = createStateMachine();

const name = reactiveCell('Alex');

console.log(name.get()); // 'Alex'

name.set('Max');
name.set((prev) => prev + '!');
console.log(name.get()); // 'Max!'
```

По умолчанию, если новое значение строго равно старому (`current === v`), подписчики не оповещаются. Чтобы принудительно вызвать оповещение подписчиков даже при том же значении, передаётся опция `{ force: true }`:

```ts
const flag = reactiveCell(true, { force: true });
flag.set(true); // подписчики всё равно сработают
```

<br>

## <span id="computed">Вычисляющие коробки - computedCell:</span>

- [К оглавлению](#contents)

<br>

`computedCell(computeFn, options?)` лениво вычисляет производное значение при первом обращении через `.get()` и кеширует результат до изменения любой из зависимостей, прочитанных внутри `computeFn`.

```ts
const { reactiveCell, computedCell } = createStateMachine();

const price = reactiveCell(100);
const count = reactiveCell(3);

const total = computedCell(() => price.get() * count.get());

console.log(total.get()); // 300 (вычислилось и закешировалось)
console.log(total.get()); // 300 (взято из кеша)

count.set(4);
console.log(total.get()); // 400
```

Зависимости отслеживаются динамически на каждом пересчёте: если ветка `if/else` перестала читать какую-то ячейку, подписка на неё автоматически отпадает.

<br>

## <span id="objects">Работа с объектами:</span>

- [К оглавлению](#contents)

<br>

`reactiveCell` не оборачивает поля объекта в `Proxy` автоматически — объект хранится как единое значение. Чтобы не вызывать лишних пересчётов при изменении неважных полей объекта, используются ключи инвалидации (`keyDescriptors`).

```ts
const { reactiveCell, computedCell } = createStateMachine();

const user = reactiveCell({ id: 1, name: 'Ivan', lastSeen: 100 });

const userName = computedCell(() => user.get().name, {
  keyDescriptors: [[user, (u) => [u.name]]],
});
```

При вызове `user.set({ ...user.get(), lastSeen: 200 })` вычисляемая ячейка `userName` проверит массив ключей `[u.name]` и **не будет** пересчитываться и дёргать своих подписчиков.

<br>

## <span id="staticKeyDescriptors">Ключи инвалидации при объявлении computedCell (статические):</span>

- [К оглавлению](#contents)

<br>

Этот режим задаётся заранее в момент создания `computedCell` через опцию `{ keyDescriptors }`. Он подходит для случаев, когда набор отслеживаемых полей исходного объекта известен статически и не зависит от условий внутри вычисления.

Каждый дескриптор передаётся в виде кортежа `[sourceCell, (value) => keysArray]`:

```ts
const { reactiveCell, computedCell } = createStateMachine();

const profile = reactiveCell({
  firstName: 'Ivan',
  lastName: 'Petrov',
  age: 30,
});

const fullName = computedCell(
  () => `profile.get().firstName {profile.get().lastName}`,
  {
    keyDescriptors: [[profile, (p) => [p.firstName, p.lastName]]],
  }
);
```

Перед пересчётом `computedCell` сравнивает новый массив ключей с закешированным. Если значения в массиве ключей совпадают — пересчёт и оповещение подписчиков отменяются.

<br>

## <span id="dynamicKeyDescriptors">Ключи инвалидации при чтении через get(comparableKeys) (динамические):</span>

- [К оглавлению](#contents)

<br>

Помимо статических `keyDescriptors` при создании `computedCell`, функцию-селектор ключей `getComparableKeys` можно передавать непосредственно в момент чтения ячейки — аргументом в `cell.get((value) => [...])` внутри `computedCell` или `actionCell`.

```ts
const { reactiveCell, computedCell, actionCell } = createStateMachine();

const user = reactiveCell({
  id: 1,
  name: 'Ivan',
  role: 'admin',
  lastSeen: 100,
});

// 1. Внутри computedCell с условной логикой
const badge = computedCell(() => {
  const role = user.get((u) => [u.role]);
  if (role === 'admin') {
    return `Admin: \${user.get((u) => [u.name])}`;
  }
  return 'Guest';
});

// 2. Внутри actionCell (где нет объекта опций при создании)
const logName = actionCell(() => {
  const name = user.get((u) => [u.name]);
  console.log('Имя изменилось:', name);
});

logName(); // Имя изменилось: Ivan

// Изменение lastSeen не затронет ни badge, ни logName
user.set({ ...user.get(), lastSeen: 200 });
```

**Как это работает:** при каждом вызове `.get(selector)` вычисленный массив ключей привязывается к текущему активному узлу в стеке. Если при обновлении источника все наборы ключей, записанные во время последнего запуска, остались равны — оповещение подписчика отменяется, а подписка сохраняется до следующего изменения.

<br>

## <span id="arrays">Работа с массивами, слои преобразования, работа с элементами массива:</span>

- [К оглавлению](#contents)

<br>

Если в `reactiveCell` или `computedCell` передан массив, ячейка получает расширенный интерфейс для работы со списком (`size()`, `map()`, `filter()`, `reduce()`, `sort()`, `getItemCellById()`, `getItemCellByIndex()`, `getBindItemCellByIndex()`, `getItemCells()`, `getBindItemCells()`, `getOrderById()`).

- В `reactiveCell` массив определяется автоматически. Если элементы являются объектами с полем `id` (`string | number | symbol`), опции можно не передавать — идентификатор подхватится автоматически.
- В `computedCell` для массивов объектов с полем `id` необходимо передать флаг `{ isArray: true }` (так как вычисление ленивое).
- Для массивов примитивов или объектов без поля `id` в обоих случаях обязательно передаётся `getListCellId`:

```ts
const { reactiveCell, computedCell } = createStateMachine();

// Автоматический id в reactiveCell
const users = reactiveCell([
  { id: 1, name: 'Ann' },
  { id: 2, name: 'Bob' },
]);

// Вычисляемый массив с полем id
const sortedUsers = computedCell(
  () => [...users.get()].sort((a, b) => a.name.localeCompare(b.name)),
  { isArray: true }
);

// Кастомный идентификатор элемента
const tags = reactiveCell(['js', 'ts'], {
  getListCellId: (item) => item,
});

console.log(users.size()); // 2
```

Метод `users.sort((a, b) => ...)` мутирует массив на месте, пересчитывает внутреннюю карту индексов `sortedIds` и оповещает подписчиков только если порядок элементов реально изменился.

<br>

## <span id="arrayReducers">Слои преобразования массива:</span>

- [К оглавлению](#contents)

<br>

Методы `.map()` и `.filter()` на реактивном массиве возвращают новый реактивный массив (`ArrayDecorationManagement<ComputedManagement<...>>`), который наследует `getListCellId` и `getListCellKey`, позволяя строить цепочки преобразований:

```ts
const { reactiveCell } = createStateMachine();

const numbers = reactiveCell([
  { id: 1, val: 10, active: true },
  { id: 2, val: 20, active: false },
  { id: 3, val: 30, active: true },
]);

const activeDoubled = numbers
  .filter((item) => item.active)
  .map((item) => ({ id: item.id, val: item.val * 2 }));

console.log(activeDoubled.get());
// [{ id: 1, val: 20 }, { id: 3, val: 60 }]

const sum = activeDoubled.reduce((acc, item) => acc + item.val, 0);
console.log(sum.get()); // 80
```

**Кеширование срезов `map` и `filter`:**
Созданные через `.map(fn)` и `.filter(fn)` производные ячейки кешируются во внутренних `WeakMap` по ссылке на переданную функцию-обработчик (`fn`). Если вызывать `.map(fn)` или `.filter(fn)` повторно с той же ссылкой на функцию (например, вынесенной за пределы компонента или эффекта), новый `computedCell` не создаётся — возвращается уже существующий реактивный срез. Как только ссылка на функцию перестаёт использоваться, сборщик мусора автоматически очищает кеш.

Если метод `.reduce(fn, initialValue, options?)` возвращает новый массив, для получения декорированного реактивного массива третьим аргументом передаются `{ isArray: true }` (и `getListCellId`, если у элементов нет поля `id`).

<br>

## <span id="arrayItems">Работа с элементами массива:</span>

- [К оглавлению](#contents)

<br>

Для гранулярной подписки на конкретный элемент списка без перерисовки всего массива используются мемоизированные ячейки элементов:

- `getItemCellById(id, options?)` — возвращает `ComputedManagement<Item>` для элемента с указанным `id`. По умолчанию не реагирует на изменение позиции элемента в массиве, если не передано `{ watchOrder: true }`.
- `getItemCellByIndex(index, options?)` — возвращает ячейку, привязанную строго к позиции `index` в массиве (при сортировке или удалении элементов вернёт новый элемент, оказавшийся на этом индексе).
- `getBindItemCellByIndex(index, options?)` — находит элемент по текущему `index` в момент вызова, но далее привязывается к нему по `id` (с включённым `{ watchOrder: true }`).
- `getItemCells(options?)` / `getBindItemCells(options?)` — возвращают массив ячеек для всех текущих элементов (по индексам или с привязкой по `id` соответственно).
- `getOrderById(id)` — возвращает текущий индекс элемента по его `id` (или `null`).

```ts
const { reactiveCell, actionCell } = createStateMachine();

const list = reactiveCell([
  { id: 'a', text: 'Первый' },
  { id: 'b', text: 'Второй' },
]);

const itemA = list.getItemCellById('a', {
  keyDescriptors: [[list, () => [list.get().find((i) => i.id === 'a')?.text]]],
});

const logItem = actionCell(() => {
  console.log('Элемент A:', itemA.get());
});

logItem(); // Элемент A: { id: 'a', text: 'Первый' }

// Сортировка не вызовет срабатывание itemA, так как watchOrder: false
list.sort((a, b) => b.id.localeCompare(a.id));
```

<br>

## <span id="async">Асинхронные вызовы в computed - asyncStacking / asyncStackedAction / pipe:</span>

- [К оглавлению](#contents)

<br>

### `pipe` и символ `awaiting`

`pipe((put) => cleanupFn)` позволяет вернуть из `computedCell` асинхронный поток данных. Пока `put(value)` не вызван, чтение `.get()` у такой ячейки возвращает символ `awaiting`. При повторном пересчёте старый `put` автоматически отключается и вызывается функция очистки.

```ts
import { createStateMachine, awaiting } from 'sprut-granular';

const { reactiveCell, computedCell, actionCell } = createStateMachine();

const query = reactiveCell('react');

const searchResult = computedCell(() => {
  const q = query.get();

  return pipe<string>((put) => {
    const timer = setTimeout(() => {
      put(`Результаты по запросу: ${q}`);
    }, 300);

    return () => clearTimeout(timer);
  });
});

const render = actionCell(() => {
  const data = searchResult.get();
  console.log(data === awaiting ? 'Загрузка...' : data);
});

render(); // Загрузка...
```

### `asyncStacking` и `asyncStackedAction`

Так как реактивные зависимости собираются синхронно во время выполнения функции, после `await` или внутри `setTimeout` контекст стека теряется. Для сохранения контекста текущей ячейки используются `asyncStacking` и `asyncStackedAction`:

```ts
const { reactiveCell, actionCell, asyncStacking, asyncStackedAction } =
  createStateMachine();

const multiplier = reactiveCell(2);

const runAsync = actionCell(() => {
  const keepContext = asyncStacking();

  setTimeout(() => {
    // Внутри keepContext чтение multiplier.get() снова привяжется к runAsync
    keepContext(() => {
      console.log('Результат:', multiplier.get() * 10);
    });
  }, 100);
});
```

`asyncStackedAction(fn)` дополнительно умеет автоматически вызывать `cancelAction()` у предыдущего незавершённого вызова, если функция возвращает объект вида `{ cancelAction: () => void, result?: T }`.

<br>

## <span id="action">Реактивные действия - actionCell:</span>

- [К оглавлению](#contents)

<br>

`actionCell(fn)` создаёт терминальную реакцию (аналог `effect` / `autorun`), которая не возвращает значения, а выполняет побочный эффект при изменении любой прочитанной внутри ячейки. Возвращает функцию запуска/перезапуска.

```ts
const { reactiveCell, actionCell } = createStateMachine();

const count = reactiveCell(0);

const effect = actionCell(() => {
  console.log('Новое значение:', count.get());
});

effect(); // Первый запуск для регистрации зависимостей -> Новое значение: 0
count.set(1); // Автоматический перезапуск -> Новое значение: 1
```

<br>

## <span id="event">Событийные триггеры, провокаторы - eventCell:</span>

- [К оглавлению](#contents)

<br>

`eventCell(eventResolver, events)` создаёт событийный узел, который вычисляет дескриптор события `[eventName, { eventData }?]` при изменении своих зависимостей и оповещает только тех, кто подписан на конкретное имя события.

- `listen(eventName?)` — подписывает текущую активную ячейку (`computedCell` или `actionCell`) на событие.
- `addHandler(listener, eventName?)` — навешивает прямой императивный обработчик `(eventName, ...args) => void`.

```ts
const { reactiveCell, eventCell, actionCell } = createStateMachine();

const status = reactiveCell<'idle' | 'error' | 'ok'>('idle');

const statusEvents = eventCell(
  () => [status.get(), { eventData: [Date.now()] }],
  ['idle', 'error', 'ok']
);

statusEvents.addHandler((event, timestamp) => {
  console.log(`Событие ${event} в ${timestamp}`);
}, 'error');

const onOkAction = actionCell(() => {
  statusEvents.listen('ok');
  console.log('Статус перешёл в OK');
});

onOkAction();
status.set('error'); // Сработает только addHandler('error')
status.set('ok'); // Сработает только onOkAction
```

<br>

## <span id="dissociate">Очистка от зависимостей и слушателей:</span>

- [К оглавлению](#contents)

<br>

> 🚧 Раздел и API в разработке (планируется механизм ручного уничтожения ячеек и отписки от графа зависимостей).

<br>

## <span id="hushGet">Метод, модификатор поведения - hushGet:</span>

- [К оглавлению](#contents)

<br>

Метод `.hushGet()` доступен на любой читаемой ячейке (`reactiveCell`, `computedCell`). Он возвращает текущее значение (или символ `awaiting`, если значение ещё не готово), **не регистрируя** текущую выполняемую ячейку в списке подписчиков.

```ts
const { reactiveCell, actionCell } = createStateMachine();

const a = reactiveCell(1);
const b = reactiveCell(10);

const effect = actionCell(() => {
  // Подписываемся только на `a`, значение `b` читаем тихо
  console.log(a.get() + b.hushGet());
});

effect(); // 11
b.set(20); // effect НЕ сработает
a.set(2); // effect сработает и выведет 22
```

<br>

## <span id="utils">Утилиты isReactiveCell, isReactiveArrayCell:</span>

- [К оглавлению](#contents)

<br>

Вспомогательные функции из `createStateMachine()` для проверки типов ячеек в рантайме:

- `isReactiveCell(cell)` — возвращает `true`, если переданный объект является ячейкой (`reactiveCell`, `computedCell`, `actionCell`, `eventCell`).
- `isReactiveArrayCell(cell)` — возвращает `true`, если ячейка декорирована как реактивный массив.

```ts
const { reactiveCell, isReactiveCell, isReactiveArrayCell } =
  createStateMachine();

const num = reactiveCell(1);
const arr = reactiveCell([{ id: 1 }]);

console.log(isReactiveCell(num)); // true
console.log(isReactiveArrayCell(num)); // false
console.log(isReactiveArrayCell(arr)); // true
```

<br>

## <span id="timeout">Таймаут функция:</span>

- [К оглавлению](#contents)

<br>

> 🚧 Раздел в разработке: планируется подключение планировщика очередей (`sprut-loop`) и настройка функции батчинга обновлений (`setTimeout`, `queueMicrotask`, `requestAnimationFrame`).

<br>

## <span id="devTools">Средства разработчика и дебаг:</span>

- [К оглавлению](#contents)

<br>

> 🚧 Раздел в разработке.

<br>

Описаны не все особенности. Некоторое из неописанного, возможно, будет выпилено.
