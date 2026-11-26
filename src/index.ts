const awaiting = Symbol('awaiting');

type NoInferType<T> = [T][T extends any ? 0 : never];

type BaseManagement = {
  isArray: () => boolean;
  isReactive: () => boolean;
};

type GetComparableKeys<T> = <Keys extends any[]>(value: T) => Keys;

type ReactiveManagement<T> = BaseManagement & {
  get: (getComparableKeys?: GetComparableKeys<T>) => T;
  set: (value: T | ((prevValue: T) => T)) => T;
  hushGet: () => T | typeof awaiting;
};

type ComputedManagement<T> = BaseManagement & {
  get: (getComparableKeys?: GetComparableKeys<T>) => T | typeof awaiting;
  hushGet: () => T | typeof awaiting;
  notify: (changes?: AnyReadableCell<any>) => void;
};

type ActionManagement = BaseManagement & {
  notify: () => void;
};

type EventManagement = BaseManagement & {
  listen: (eventName: string) => void;
  addHandler: (
    listener: (eventName: string, ...args: any[]) => void,
    eventName: string
  ) => void;
  notify: () => void;
};
type EventDescriptor = [
  eventName: string,
  eventMetaData?: { eventData: any[] },
];

type AnyReadableCell<T = any> = BaseManagement & {
  get: (getComparableKeys?: GetComparableKeys<T>) => T | typeof awaiting;
  hushGet: () => T | typeof awaiting;
};

type KeyDescriptor<T = any> = [
  AnyReadableCell<T>,
  (dependency: T) => Array<any>,
];

type ArrayCellOptions = {
  keyDescriptors?: KeyDescriptor[];
  watchOrder?: boolean;
};

type ArrayDecoratorOptions<T> = {
  getListCellId: (item: T, index: number, rawArray: T[]) => ArrayItemId;
  getListCellKey?: KeyDescriptor[];
};
type WhenArrayOptions = {
  isArray: true;
};

type ArrayDecorationManagement<Source, Item> = Omit<Source, 'get'> & {
  get: () => Item[];
  getOrderById: (id: ArrayItemId) => number | null;
  getItemCellById: (
    id: ArrayItemId,
    options?: ArrayCellOptions
  ) => ComputedManagement<Item>;
  getItemCellByIndex: (
    index: number,
    options?: Omit<ArrayCellOptions, 'watchOrder'>
  ) => ComputedManagement<Item | undefined>;
  getBindItemCellByIndex: (
    index: number,
    options?: ArrayCellOptions
  ) => ComputedManagement<Item>;
  getItemCells: (
    options?: Omit<ArrayCellOptions, 'watchOrder'>
  ) => ComputedManagement<Item>[];
  getBindItemCells: (options?: ArrayCellOptions) => ComputedManagement<Item>[];
  size: () => number;
  map: <NewItem>(
    mapHandler: (item: Item, index: number, array: Item[]) => NewItem
  ) => ArrayDecorationManagement<ComputedManagement<NewItem[]>, NewItem>;
  filter: (
    filterHandler: (item: Item, index: number, array: Item[]) => boolean
  ) => ArrayDecorationManagement<ComputedManagement<Item[]>, Item>;
  reduce: {
    <Acc extends { id: ArrayItemId }[]>(
      reduceHandler: (
        acc: Acc,
        item: Item,
        index: number,
        array: Item[]
      ) => Acc,
      initialValue: Acc,
      options: Partial<ArrayDecoratorOptions<Acc[number]>> & WhenArrayOptions
    ): ArrayDecorationManagement<ComputedManagement<Acc>, Acc[number]>;
    <Acc extends any[]>(
      reduceHandler: (
        acc: Acc,
        item: Item,
        index: number,
        array: Item[]
      ) => Acc,
      initialValue: Acc,
      options: ArrayDecoratorOptions<Acc[number]> & Partial<WhenArrayOptions>
    ): ArrayDecorationManagement<ComputedManagement<Acc>, Acc[number]>;
    <Acc>(
      reduceHandler: (
        acc: Acc,
        item: Item,
        index: number,
        array: Item[]
      ) => Acc,
      initialValue: Acc
    ): ComputedManagement<Acc>;
  };
  sort: (sortHandler?: (a: Item, b: Item) => number) => void;
};

type SomeManagement<T = any> =
  | ReactiveManagement<T>
  | ComputedManagement<T>
  | ActionManagement
  | EventManagement;

type ListenerManagement<T = any> =
  ComputedManagement<T> | ActionManagement | EventManagement;

type Stack = {
  prev?: Stack;
  next?: Stack;
  data: {
    value: ListenerManagement<unknown>;
    comparableKeys?: WeakMap<AnyReadableCell<unknown>, any[][]>;
    getComparableKeys?: WeakMap<
      AnyReadableCell<unknown>,
      GetComparableKeys<any>[]
    >;
  };
};

type ArrayItemId = string | number | symbol;

interface AwaitingPipe<T> {
  isAwaiting: true;
  callback: (
    put: (value: T | ((prev: T | typeof awaiting) => T)) => void
  ) => void | (() => void);
}

function isAwaiting<T>(val: T | AwaitingPipe<T>): val is AwaitingPipe<T> {
  return typeof val === 'object' && val !== null && 'isAwaiting' in val;
}

type CancelableAsyncResult<T = unknown> = {
  cancelAction: () => void;
  result?: T;
};
type UnwrapResult<R> = R extends CancelableAsyncResult<infer T> ? T | null : R;
function isCancelableResult(val: unknown): val is CancelableAsyncResult<any> {
  return (
    typeof val === 'object' &&
    val !== null &&
    'cancelAction' in val &&
    typeof (val as CancelableAsyncResult).cancelAction === 'function'
  );
}

const NO_WATCH = Symbol('NO_WATCH');

const isReactiveCheck = () => true as const;
const noArrayCheck = () => false as const;
const isArrayCheck = () => true as const;

const defaultGetListCellId = (item: any) => item.id;

export function createStateMachine() {
  let stack: Stack | undefined;

  function addStack(value: ListenerManagement<unknown>) {
    stack = { prev: stack, data: { value } };

    if (stack.prev) {
      stack.prev.next = stack;
    }
  }

  function popStack() {
    stack = stack?.prev;

    if (stack) {
      stack.next = undefined;
    }
  }

  function decorateLikeArray<
    Item,
    T extends Array<Item>,
    S extends ReactiveManagement<T> | ComputedManagement<T>,
  >(
    management: ArrayDecorationManagement<S, Item>,
    getRawArray: () => T,
    { getListCellId, getListCellKey }: ArrayDecoratorOptions<Item>,
    subs: Set<Stack['data']>
  ) {
    const rawArray = getRawArray();
    let mapById: Record<ArrayItemId, Item> = {};
    let idMapByIndex: Record<number, ArrayItemId> = {};
    let cellMapById: Record<ArrayItemId, ComputedManagement<Item>> = {};
    let cellMapByIndex: Record<number, ComputedManagement<Item>> = {};
    let cellMapByMapHandler: WeakMap<
      Function,
      ArrayDecorationManagement<ComputedManagement<any[]>, any>
    > = new WeakMap();
    let cellMapByFilterHandler: WeakMap<
      Function,
      ArrayDecorationManagement<ComputedManagement<any[]>, any>
    > = new WeakMap();
    const sortedIds = new Map<ArrayItemId, number>();

    for (let i = 0; i < rawArray.length; i++) {
      const item = rawArray[i];

      const id = getListCellId(item, i, rawArray);

      mapById[id] = item;
      idMapByIndex[i] = id;

      sortedIds.set(id, i);
    }

    // Если усложнять функцию, то в ключах внутри getItemCellById нвдо дёргать будет management.getOrderById вместо прямого доступа к sortedIds
    management.getOrderById = (id) => sortedIds.get(id) ?? null;

    management.getItemCellById = (
      id,
      { keyDescriptors = [], watchOrder = false } = { keyDescriptors: [] }
    ) => {
      const cachedComputed = cellMapById[id];

      if (cachedComputed) {
        return cachedComputed;
      } else {
        return (cellMapById[id] = computedCell(
          (() => {
            if (id in mapById) {
              management.get();
            }

            return mapById[id];
          }) as () => any,
          {
            //force: watchOrder,
            keyDescriptors: [
              [
                management,
                () => [
                  id in mapById,
                  watchOrder ? sortedIds.get(id) : NO_WATCH,
                ],
              ],
              ...(getListCellKey ?? []),
              ...keyDescriptors,
            ],
          }
        ));
      }
    };

    management.getBindItemCellByIndex = (index, options) =>
      management.getItemCellById(idMapByIndex[index], {
        ...options,
        watchOrder: true,
      });

    management.getItemCellByIndex = (
      index,
      { keyDescriptors = [] } = { keyDescriptors: [] }
    ) => {
      const cachedComputed = cellMapByIndex[index];

      if (cachedComputed) {
        return cachedComputed;
      }

      return (cellMapByIndex[index] = computedCell(
        (() => {
          management.get();

          return mapById[idMapByIndex[index]];
        }) as () => any,
        {
          keyDescriptors: [...(getListCellKey ?? []), ...keyDescriptors],
        }
      ));
    };

    management.getItemCells = (options) => {
      const result = [];

      for (let i = 0; i < getRawArray().length; i++) {
        result.push(management.getItemCellByIndex(i, options));
      }

      return result as ComputedManagement<Item>[];
    };

    management.getBindItemCells = (options) => {
      const result: ComputedManagement<Item>[] = [];

      for (let i = 0; i < getRawArray().length; i++) {
        const cell = management.getBindItemCellByIndex(i, options);
        if (cell) {
          result.push(cell);
        }
      }

      return result;
    };

    management.size = () => {
      if (stack) {
        subs.add(stack.data);
      }

      return getRawArray().length;
    };

    // Можно сделать механизм передачи функции как возвращаемое из mapHandler для проброса вычисления зависимостей на уровень реактивности элемента
    management.map = (mapHandler) => {
      const cachedComputed = cellMapByMapHandler.get(mapHandler);

      if (cachedComputed) {
        return cachedComputed;
      }

      const forChache = computedCell(() => management.get().map(mapHandler), {
        getListCellId: getListCellId as any,
        getListCellKey,
        isArray: true,
      });

      cellMapByMapHandler.set(mapHandler, forChache);

      return forChache;
    };

    management.filter = (filterHandler) => {
      const cachedComputed = cellMapByFilterHandler.get(filterHandler);

      if (cachedComputed) {
        return cachedComputed;
      }

      const forChache = computedCell(
        () => management.get().filter(filterHandler),
        {
          getListCellId: getListCellId as any,
          getListCellKey,
          isArray: true,
        }
      );

      cellMapByFilterHandler.set(filterHandler, forChache);

      return forChache;
    };

    management.reduce = ((
      reduceHandler: (
        acc: any,
        item: Item,
        index: number,
        array: Item[]
      ) => any,
      initialValue: any,
      options?: any
    ) => {
      return computedCell(
        () => management.get().reduce(reduceHandler, initialValue),
        options
      );
    }) as any;

    management.sort = (sortHandler) => {
      const array = getRawArray();
      let isChanged = false;

      array.sort(sortHandler);

      for (let i = 0; i < array.length; i++) {
        const itemId = getListCellId(array[i], i, array);

        if (i !== sortedIds.get(itemId)) {
          sortedIds.set(itemId, i);
          idMapByIndex[i] = itemId;

          isChanged = true;
        }
      }

      if (isChanged) {
        triggerSubscribers(
          subs,
          management as unknown as AnyReadableCell,
          array
        );
      }
    };

    management.isArray = isArrayCheck;

    return {
      preNotify: () => {
        // Может переделаю на поиск отсутствующих и явно буду оповещать, не знаю
        const array = getRawArray();
        const prevCellMapById = cellMapById;

        cellMapById = {};

        mapById = {};
        idMapByIndex = {};
        sortedIds.clear();

        for (let i = 0; i < array.length; i++) {
          const item = array[i];

          const id = getListCellId(item, i, array);

          mapById[id] = item;
          idMapByIndex[i] = id;

          if (prevCellMapById[id]) {
            cellMapById[id] = prevCellMapById[id];
          }

          sortedIds.set(id, i);
        }
      },
    };
  }

  type ArrayConfigFields<T> = {
    getListCellId: (item: T, index: number, rawArray: T[]) => ArrayItemId;
    getListCellKey?: KeyDescriptor[];
  };
  type ReactiveOptions = { force?: boolean };

  function manageGetterComparableKeys<T, V extends AnyReadableCell>(
    getComparableKeys: GetComparableKeys<T> | undefined,
    current: T,
    management: V
  ) {
    let newKeys: any[];

    if (stack && getComparableKeys) {
      newKeys = getComparableKeys(current);

      if (!stack.data.comparableKeys) {
        stack.data.comparableKeys = new WeakMap();
      }

      let keysArray = stack.data.comparableKeys.get(management);

      if (!keysArray) {
        stack.data.comparableKeys.set(management, (keysArray = []));
      }

      keysArray.push(newKeys);

      if (!stack.data.getComparableKeys) {
        stack.data.getComparableKeys = new WeakMap();
      }

      let comparableKeysArray = stack.data.getComparableKeys.get(management);

      if (!comparableKeysArray) {
        stack.data.getComparableKeys.set(
          management,
          (comparableKeysArray = [])
        );
      }

      comparableKeysArray.push(getComparableKeys);
    }
  }

  function reactiveCell<Item extends { id: ArrayItemId }>(
    value: Item[],
    options?: Partial<ArrayConfigFields<NoInferType<Item>>> & ReactiveOptions
  ): ArrayDecorationManagement<ReactiveManagement<Item[]>, Item>;

  function reactiveCell<Item>(
    value: Item[],
    options: ArrayConfigFields<NoInferType<Item>> & ReactiveOptions
  ): ArrayDecorationManagement<ReactiveManagement<Item[]>, Item>;

  function reactiveCell<T>(
    value: T extends readonly any[] ? never : T,
    options?: ReactiveOptions
  ): ReactiveManagement<T>;

  function reactiveCell<T>(
    value: T,
    options: ReactiveOptions & Partial<ArrayConfigFields<any>> = {}
  ) {
    let current = value;
    const subs = new Set<Stack['data']>();
    const management = {} as ReactiveManagement<T> &
      Partial<
        Omit<ArrayDecorationManagement<ReactiveManagement<T>, any>, 'get'>
      >;

    let likeArray = false;
    let preNotifyArray:
      ReturnType<typeof decorateLikeArray>['preNotify'] | null = null;

    management.get = (getComparableKeys?: GetComparableKeys<T>) => {
      manageGetterComparableKeys(getComparableKeys, current, management);

      if (stack) {
        subs.add(stack.data);
      }

      return current;
    };

    management.set = (v) => {
      if (v instanceof Function) {
        v = v(current);
      }

      if (!options?.force && current === v) {
        return current;
      }

      current = v;

      if (preNotifyArray) {
        preNotifyArray();
      }

      triggerSubscribers(subs, management as unknown as AnyReadableCell, v);

      return v;
    };

    if (Array.isArray(value) || options.getListCellId) {
      const arrayDecorateManagement = decorateLikeArray(
        management as any,
        () => (isAwaiting(current) ? ([] as any) : (current as any)),
        {
          getListCellId: options.getListCellId ?? defaultGetListCellId,
          getListCellKey: options.getListCellKey,
        },
        subs
      );
      likeArray = true;
      preNotifyArray = arrayDecorateManagement.preNotify;
    }

    management.hushGet = () => (isAwaiting<T>(current) ? awaiting : current);
    management.isArray = () => likeArray;
    management.isReactive = isReactiveCheck;

    return management;
  }

  // Пока что нифига не deep
  function isDeepEquals(a_1: any, a_2: any) {
    if (a_1.length !== a_2.length) {
      return false;
    }

    for (let i in a_1) {
      if (a_1[i] !== a_2[i]) {
        return false;
      }
    }

    return true;
  }

  type ComputedOptions<D extends readonly unknown[] = any[]> = {
    keyDescriptors?: { [I in keyof D]: KeyDescriptor<D[I]> };
    force?: boolean;
  };

  function computedCell<
    Item extends { id: ArrayItemId },
    D extends readonly unknown[] = [],
  >(
    compute: () => Item[],
    options: Partial<ArrayConfigFields<NoInferType<Item>>> &
      ComputedOptions<D> &
      WhenArrayOptions
  ): ArrayDecorationManagement<ComputedManagement<Item[]>, Item>;

  function computedCell<Item, D extends readonly unknown[] = []>(
    compute: () => Item[],
    options: ArrayConfigFields<NoInferType<Item>> &
      ComputedOptions<D> &
      Partial<WhenArrayOptions>
  ): ArrayDecorationManagement<ComputedManagement<Item[]>, Item>;

  function computedCell<T, D extends readonly unknown[] = []>(
    compute: () => T extends readonly any[] ? never : T,
    options?: ComputedOptions<D>
  ): ComputedManagement<T>;

  function computedCell<T, D extends readonly unknown[] = []>(
    compute: () => T,
    options: ComputedOptions<D> &
      Partial<ArrayConfigFields<any>> &
      Partial<WhenArrayOptions> = {}
  ) {
    let current: T | ReturnType<typeof pipe<T>>;
    const subs = new Set<Stack['data']>();
    const keyCache = new WeakMap();
    const management = {} as ComputedManagement<T> &
      Partial<
        Omit<ArrayDecorationManagement<ComputedManagement<T>, any>, 'get'>
      >;

    let currentPut: ReturnType<typeof createPut> | null = null;
    let cancelPut: ReturnType<AwaitingPipe<T>['callback']> | null = null;
    let inited = false;
    let likeArray = false;
    let preNotifyArray:
      ReturnType<typeof decorateLikeArray>['preNotify'] | null = null;

    management.get = (getComparableKeys?: GetComparableKeys<T>) => {
      if (stack) {
        subs.add(stack.data);
      }

      if (currentPut) {
        const resolved = isAwaiting<T>(current) ? awaiting : (current as T);

        if (resolved !== awaiting) {
          manageGetterComparableKeys(getComparableKeys, resolved, management);
        }

        return resolved;
      }

      if (!inited) {
        if (options.keyDescriptors) {
          rewriteComputedKeyCache(
            options.keyDescriptors as KeyDescriptor[],
            keyCache
          );
        }

        addStack(management);
        current = compute();
        popStack();

        inited = true;

        if (isAwaiting<T>(current)) {
          const put = (currentPut = createPut());
          cancelPut = current.callback(put);
        }
      }

      const resolved = isAwaiting<T>(current) ? awaiting : (current as T);

      if (resolved !== awaiting) {
        manageGetterComparableKeys(getComparableKeys, resolved, management);
      }

      return resolved;
    };

    management.notify = (changes) => {
      let isChanged = false;

      if (changes) {
        const prevKeys = keyCache.get(changes);
        const keyDescriptor = options.keyDescriptors?.find(
          ([o]) => o === changes
        );

        if (keyDescriptor) {
          const currentKeys = keyDescriptor[1](changes.hushGet() as any);
          const isEquals = isDeepEquals(currentKeys, prevKeys);

          if (isEquals) {
            return;
          }

          isChanged = true;
        }
      }

      if (options.keyDescriptors) {
        rewriteComputedKeyCache(
          options.keyDescriptors as KeyDescriptor[],
          keyCache
        );
      }

      currentPut = null;
      if (cancelPut) {
        cancelPut();
        cancelPut = null;
      }

      addStack(management);
      const value = compute();
      popStack();

      if (isAwaiting<T>(value)) {
        const put = (currentPut = createPut());
        cancelPut = value.callback(put);
      }

      if (isChanged || options.force || value !== current) {
        current = value;

        if (preNotifyArray) {
          preNotifyArray();
        }

        triggerSubscribers(subs, management, current);
      }
    };

    if (options.isArray || options.getListCellId) {
      addStack(management);
      current = compute();
      popStack();
      inited = true;

      const arrayDecorateManagement = decorateLikeArray(
        management as any,
        () => (isAwaiting(current) ? ([] as any) : (current as any)),
        {
          getListCellId: options.getListCellId ?? defaultGetListCellId,
          getListCellKey: options.getListCellKey,
        },
        subs
      );

      likeArray = true;
      preNotifyArray = arrayDecorateManagement.preNotify;
    }

    function createPut() {
      const put = (value: T | ((prev: T | typeof awaiting) => T)) => {
        if (put === currentPut) {
          const prev = isAwaiting(current) ? awaiting : current;
          const nextValue = value instanceof Function ? value(prev) : value;

          if (nextValue !== prev) {
            current = nextValue;

            if (preNotifyArray) {
              preNotifyArray();
            }

            triggerSubscribers(subs, management, current);
          }
        }
      };

      return put;
    }

    management.hushGet = () => (isAwaiting(current) ? awaiting : current);
    management.isArray = () => likeArray;
    management.isReactive = isReactiveCheck;

    return management;
  }

  function triggerSubscribers<T>(
    subs: Set<Stack['data']>,
    sourceManagement: AnyReadableCell<unknown>,
    value: T
  ) {
    const _subs = [...subs.values()];

    subs.clear();

    for (let stackData of _subs) {
      if (stackData.comparableKeys) {
        const newKeys = stackData.getComparableKeys!.get(sourceManagement);
        const arrayKeys = stackData.comparableKeys.get(sourceManagement);

        if (!newKeys || !arrayKeys) {
          stackData.comparableKeys.delete(sourceManagement);
          stackData.getComparableKeys!.delete(sourceManagement);

          stackData.value.notify(
            value instanceof Object ? sourceManagement : undefined
          );

          continue;
        }

        let isChanged = false;

        for (let keys in arrayKeys) {
          if (!isDeepEquals(arrayKeys[keys], newKeys[keys](value))) {
            isChanged = true;

            break;
          }
        }

        if (!isChanged) {
          subs.add(stackData);

          continue;
        }

        stackData.comparableKeys.delete(sourceManagement);
        stackData.getComparableKeys!.delete(sourceManagement);
      }

      stackData.value.notify(
        value instanceof Object ? sourceManagement : undefined
      );
    }
  }

  function rewriteComputedKeyCache(
    keyDescriptors: KeyDescriptor[],
    keyCache: WeakMap<object, ReturnType<KeyDescriptor[1]>>
  ) {
    for (let descriptor of keyDescriptors) {
      keyCache.set(descriptor[0], descriptor[1](descriptor[0].hushGet()));
    }
  }

  function actionCell(action: () => void) {
    const management: ActionManagement = {} as ActionManagement;

    management.notify = () => {
      addStack(management);
      action();
      popStack();
    };

    management.isReactive = isReactiveCheck;

    management.isArray = noArrayCheck;

    return management.notify;
  }

  function eventCell(eventResolver: () => EventDescriptor, events: string[]) {
    const management: EventManagement = {} as EventManagement;
    const subs = new Map<string, Set<Stack['data']>>();
    const listeners = new Map<
      string,
      Set<Parameters<EventManagement['addHandler']>['0']>
    >();

    for (let e of events) {
      subs.set(e, new Set());
    }

    for (let e of events) {
      listeners.set(e, new Set());
    }

    const getEventDescriptFromResolverAndTriggerSubscribers = () => {
      addStack(management);
      const eventDescriptor = eventResolver();
      popStack();

      return eventDescriptor;
    };

    management.notify = () => {
      const eventDescriptor =
        getEventDescriptFromResolverAndTriggerSubscribers();

      // Заглушки для eventData - может убрать или как-то прокинуть
      const [eventName, { eventData = [] } = {}] = eventDescriptor;

      const subsSet = subs.get(eventName);

      if (subsSet) {
        const _subs = [...subsSet.values()];

        subsSet.clear();

        for (let sub of _subs) {
          // @ts-ignore
          sub.value.notify(eventName, ...eventData);
        }

        const eventListeners = listeners.get(eventName);

        if (eventListeners) {
          for (let sub of eventListeners.values()) {
            sub(eventName, ...eventData);
          }
        }
      }
    };

    management.listen = (event) => {
      if (stack) {
        if (event) {
          subs.get(event)?.add(stack.data);
        } else {
          for (let e of events) {
            subs.get(e)?.add(stack.data);
          }
        }
      }
    };

    management.addHandler = (listener, event) => {
      if (event) {
        listeners.get(event)?.add(listener);
      } else {
        for (let e of events) {
          listeners.get(e)?.add(listener);
        }
      }
    };

    management.isArray = noArrayCheck;

    management.isReactive = isReactiveCheck;

    getEventDescriptFromResolverAndTriggerSubscribers();

    return management;
  }

  function asyncStacking() {
    const stackManagement = stack?.data.value;

    if (!stackManagement) {
      throw new Error(
        'Невалидный вызов хранителей контекста реактивности вне какого-либо контекста'
      );
    }

    return <T extends () => void | (() => void)>(callback: T) => {
      addStack(stackManagement);
      const cancelAction = callback();
      popStack();

      return cancelAction;
    };
  }

  function asyncStackedAction<Args extends any[], R>(
    callback: (...args: Args) => R | CancelableAsyncResult<R>
  ): (...args: Args) => UnwrapResult<R> {
    const stackManagement = stack?.data.value;

    if (!stackManagement) {
      throw new Error(
        'Невалидный вызов хранителей контекста реактивности вне какого-либо контекста'
      );
    }

    let cancelAction: (() => void) | null = null;

    return (...args: Args): UnwrapResult<R> => {
      addStack(stackManagement);
      const result = callback(...args);
      popStack();

      if (isCancelableResult(result)) {
        cancelAction?.();
        cancelAction = result.cancelAction;

        return (result.result ?? null) as UnwrapResult<R>;
      }

      return result as UnwrapResult<R>;
    };
  }

  function pipe<T>(callback: AwaitingPipe<T>['callback']): AwaitingPipe<T> {
    return { isAwaiting: true as const, callback };
  }

  function isReactiveCell(cell: SomeManagement<unknown>) {
    return cell.isReactive();
  }

  function isReactiveArrayCell(cell: SomeManagement<unknown>) {
    return cell.isArray?.();
  }

  return {
    reactiveCell,
    computedCell,
    actionCell,
    eventCell,
    asyncStacking,
    asyncStackedAction,
    pipe,
    isReactiveCell,
    isReactiveArrayCell,
  };
}
