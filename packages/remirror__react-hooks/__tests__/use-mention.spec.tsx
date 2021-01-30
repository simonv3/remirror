import { RemirrorTestChain } from 'jest-remirror';
import { FC, useCallback, useEffect, useState } from 'react';
import { assertGet } from 'remirror';
import { act, DefaultEditor, strictRender } from 'testing/react';
import { NON_BREAKING_SPACE_CHAR } from '@remirror/core';
import { MentionExtension, MentionExtensionAttributes } from '@remirror/extension-mention';
import { ChangeReason } from '@remirror/pm/suggest';
import { createReactManager, Remirror } from '@remirror/react';

import { MentionState, useMention, UseMentionExitHandler } from '../use-mention';

describe('useMention', () => {
  it('should respond to mention changes', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper />);

    expect(result.mention).toBeNull();

    act(() => {
      editor.insertText('@a');
    });

    expect(result.mention).toEqual({
      command: expect.any(Function),
      name: 'at',
      index: 0,
      reason: ChangeReason.Start,
      query: { full: 'a', partial: 'a' },
      text: { full: '@a', partial: '@a' },
      range: { from: 17, to: 19, cursor: 19 },
    });
    expect(result.items.length > 0).toBeTrue();
  });

  it('should correctly add the mention when the command is called', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper />);

    acts([
      () => {
        editor.insertText('@a');
      },
      () => {
        result.mention?.command({ ...assertGet(result.items, 0) });
      },
      () => {
        editor.insertText('more to come');
      },
    ]);

    expect(editor.innerHTML).toMatchInlineSnapshot(`
      <p>
        Initial content
        <a role="presentation"
           href="//test.com/aa"
           class="mention mention-at"
           data-mention-id="aa"
           data-mention-name="at"
        >
          @aa
        </a>
        &nbsp;more to come
      </p>
    `);
  });

  it('should not append space multiple times', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper />);
    acts([
      () => {
        editor.insertText('@a');
      },
      () => {
        result.mention?.command({ ...assertGet(result.items, 0) });
      },
      () => {
        editor.selectText(19);
      },
      () => {
        result.mention?.command({ ...assertGet(result.items, 0) });
      },
      () => {
        editor.selectText('end');
      },
      () => {
        editor.insertText('more to come');
      },
    ]);

    expect(editor.innerHTML).toMatchInlineSnapshot(`
      <p>
        Initial content
        <a role="presentation"
           href="//test.com/aa"
           class="mention mention-at"
           data-mention-id="aa"
           data-mention-name="at"
        >
          @aa
        </a>
        &nbsp;more to come
      </p>
    `);
  });

  it('should not trap the cursor in the mention', () => {
    const { editor, Wrapper } = createEditor();

    strictRender(<Wrapper />);

    acts([
      () => {
        editor.insertText('@a').selectText(1).insertText('ab ');
      },
    ]);

    expect(editor.innerHTML).toMatchInlineSnapshot(`
      <p>
        ab Initial content
        <a role="presentation"
           href="/a"
           class="mention mention-at"
           data-mention-id="a"
           data-mention-name="at"
        >
          @a
        </a>
      </p>
    `);
  });

  it('should clear suggestions when the `Escape` key is pressed', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper />);

    acts([
      () => {
        editor.insertText('#a');
      },
      () => {
        editor.press('Escape');
      },
    ]);

    expect(result.mention).toBeNull();

    act(() => {
      editor.insertText('a');
    });

    expect(result.mention).toBeNull();
  });

  it('can set `ignoreMatchesOnEscape` to false', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper ignoreMatchesOnEscape={false} />);

    acts([
      () => {
        editor.insertText('#a');
      },
      () => {
        editor.press('Escape');
      },
    ]);

    expect(result.mention).toBeNull();

    act(() => {
      editor.insertText('a');
    });

    expect(result.mention).toEqual(
      expect.objectContaining({ text: { full: '#aa', partial: '#aa' } }),
    );
  });

  it('should choose selection when `Enter` key is pressed', () => {
    const { editor, Wrapper } = createEditor();

    strictRender(<Wrapper />);

    acts([
      () => {
        editor.insertText('#a');
      },
      () => {
        editor.press('Enter');
      },
      () => {
        editor.insertText('more to come');
      },
    ]);

    expect(editor.innerHTML).toMatchInlineSnapshot(`
      <p>
        Initial content
        <a role="presentation"
           href="//test.com/aa"
           class="mention mention-tag"
           data-mention-id="aa"
           data-mention-name="tag"
        >
          #AAi
        </a>
        &nbsp;more to come
      </p>
    `);
  });

  it('should update index when `Arrow` keys are used', () => {
    const { editor, Wrapper, result } = createEditor();

    strictRender(<Wrapper />);

    acts([
      () => {
        editor.insertText('#i');
      },
      () => {
        editor.press('ArrowDown');
      },
    ]);

    expect(result.mention?.index).toBe(1);

    acts([
      () => {
        editor.press('ArrowUp');
      },
      () => {
        editor.press('ArrowUp');
      },
    ]);

    expect(result.mention?.index).toBe(result.items.length - 1);
  });
});

/**
 * This function is used as a helper when testing the mention hooks.
 */
function createEditor() {
  const manager = createReactManager(() => [
    new MentionExtension({
      extraAttributes: { role: 'presentation', href: { default: null } },
      appendText: NON_BREAKING_SPACE_CHAR,
      matchers: [
        { name: 'at', char: '@', appendText: ' ' },
        { name: 'tag', char: '#', appendText: ' ' },
      ],
    }),
  ]);

  const editor = RemirrorTestChain.create(manager);
  const { doc, p } = editor.nodes;

  interface GetItemsProps {
    name: string;
    query: string;
  }

  const getItems = jest.fn((parameter?: GetItemsProps) => {
    if (!parameter) {
      return [];
    }

    const { name, query } = parameter;

    if (name === 'tag') {
      return allTags.filter((tag) => tag.label.toLowerCase().includes(query.toLowerCase()));
    }

    if (name === 'at') {
      return allUsers.filter((user) => user.label.toLowerCase().includes(query.toLowerCase()));
    }

    return [];
  });

  interface GetItemsProps {
    name: string;
    query: string;
  }

  interface Result {
    mention: MentionState | null;
    items: MentionExtensionAttributes[];
  }

  const result: Result = {
    mention: null,
    items: [],
  };

  interface Props {
    ignoreMatchesOnEscape?: boolean;
  }

  const Component: FC<Props> = ({ ignoreMatchesOnEscape }) => {
    const [items, setItems] = useState(() => getItems());

    const onExit: UseMentionExitHandler = useCallback(({ query }, command) => {
      // Auto create the mention.
      command({ href: `/${query.full}` });
    }, []);

    const { mention } = useMention({ items, onExit, ignoreMatchesOnEscape });
    result.items = items;
    result.mention = mention;

    useEffect(() => {
      if (!mention) {
        return;
      }

      setItems(getItems({ name: mention.name, query: mention.query.full }));
    }, [mention]);

    return null;
  };

  const Wrapper: FC<Props> = (props) => {
    return (
      <Remirror manager={manager} initialContent={[doc(p('Initial content ')), 'end']}>
        <DefaultEditor />
        <Component {...props} />
      </Remirror>
    );
  };

  return { editor, Wrapper, result };
}

function acts(methods: Array<() => void | undefined>) {
  for (const method of methods) {
    act(method);
  }
}

const allUsers: MentionExtensionAttributes[] = [
  {
    label: '@aa',
    href: '//test.com/aa',
    id: 'aa',
  },
  {
    label: '@bb',
    href: '//test.com/bb',
    id: 'bb',
  },
  {
    label: '@cc',
    href: '//test.com/cc',
    id: 'cc',
  },
  {
    label: '@dd',
    href: '//test.com/dd',
    id: 'dd',
  },
];

const allTags: MentionExtensionAttributes[] = [
  { label: '#AAi', href: '//test.com/aa', id: 'aa' },
  { label: '#BBi', href: '//test.com/bb', id: 'bb' },
  { label: '#CCi', href: '//test.com/cc', id: 'cc' },
  { label: '#DDi', href: '//test.com/dd', id: 'dd' },
  { label: '#EEi', href: '//test.com/ee', id: 'ee' },
  { label: '#FFi', href: '//test.com/ff', id: 'ff' },
  { label: '#GGi', href: '//test.com/gg', id: 'gg' },
  { label: '#HHi', href: '//test.com/hh', id: 'hh' },
];