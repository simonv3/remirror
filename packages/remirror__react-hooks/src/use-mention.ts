import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { Replace } from '@remirror/core';
import type {
  MentionChangeHandler,
  MentionChangeHandlerCommand,
  MentionExtensionAttributes,
} from '@remirror/extension-mention';
import { MentionExtension } from '@remirror/extension-mention';
import { ChangeReason, ExitReason, SuggestChangeHandlerProps } from '@remirror/pm/suggest';
import { useExtension, useHelpers } from '@remirror/react-core';

import { useMenuNavigation, UseMenuNavigationReturn } from './use-menu-navigation';

export interface MentionState<Data extends MentionExtensionAttributes = MentionExtensionAttributes>
  extends Pick<SuggestChangeHandlerProps, 'name' | 'query' | 'text' | 'range'> {
  /**
   * This command when the mention is active.
   */
  command: (item: Data) => void;

  /**
   * The reason for the change.
   */
  reason: ChangeReason;
}

/**
 * The hook for managing the mention keyboard handlers.
 *
 * @param props - the props passed in to the `useMention` hook
 * @param setState - the state setter to update the state
 * @param currentIndex - the index which defaults to 0 when not provided
 */
function useMentionChangeHandler<
  Data extends MentionExtensionAttributes = MentionExtensionAttributes
>(props: UseMentionProps<Data>, setState: SetMentionState, currentIndex = 0) {
  const { onExit } = props;

  /**
   * The is the callback for when a suggestion is changed.
   */
  const onChange: MentionChangeHandler = useCallback(
    (props, cmd) => {
      const {
        query,
        text,
        range,
        ignoreNextExit,
        name,
        exitReason,
        changeReason,
        textAfter,
        defaultAppendTextValue,
      } = props;

      // Ignore the next exit since it has been triggered manually but
      // only when this is caused by a change. This is because the command
      // might be setup to automatically be created on an exit.
      if (changeReason) {
        const command: MentionChangeHandlerCommand = (attrs) => {
          // Ignore the next exit since this exit is artificially being
          // generated.
          ignoreNextExit();

          const regex = /^\s+/;

          const appendText = regex.test(textAfter) ? '' : defaultAppendTextValue;

          // Default to append text only when the textAfter the match does not
          // start with a whitespace character. However, this can be overridden
          // by the user.
          cmd({ appendText, ...attrs });

          // Reset the state, since the query has been exited.
          setState(null);
        };

        // Set the index to 0 (move to the first item in the items list) unless
        // the reason for the change was a cursor move within the same matching
        // area. In that case maintain the current index.
        const index = changeReason === ChangeReason.Move ? currentIndex : 0;

        // Update the active state after the change providing the command and
        // potentially updated index.
        setState({ reason: changeReason, index, name, query, text, range, command });

        return;
      }

      if (!exitReason || !onExit) {
        // Reset the state and do nothing when no onExit handler provided
        setState(null);
        return;
      }

      const exitCommand: MentionChangeHandlerCommand = (attrs) => {
        cmd({ appendText: '', ...attrs });
      };

      // Call the onExit handler.
      onExit({ reason: exitReason, index: currentIndex, name, query, text, range }, exitCommand);

      // Reset the state to remove the active query return.
      setState(null);
    },
    [onExit, currentIndex, setState],
  );

  // Add the handlers to the `MentionExtension`
  useExtension(MentionExtension, ({ addHandler }) => addHandler('onChange', onChange), [onChange]);
}

type SetMentionState = Dispatch<SetStateAction<MentionState | null>>;

export interface UseMentionReturn<
  Data extends MentionExtensionAttributes = MentionExtensionAttributes
> {
  menu: UseMenuNavigationReturn<Data>;
  mention: MentionState<Data> | null;
}

/**
 * A hook that provides the state for social mentions that responds to
 * keybindings and key-presses from the user.
 *
 * This is used by the `SocialMentionDropdown` component and can be used by you
 * for a customized component.
 *
 * The only prop required is the list of data in order to support keybinding and
 * properly selecting the index for you. The data must have a `label` and `id`
 * key. The label is the text that should be shown inside the mention and the
 * `id` is whatever unique identifier that can be used.
 *
 * You can also add other supported attributes which will be added to the
 * mention node, like `href` and whatever you decide.
 *
 * @param list - the list of data from which an index can be calculated. Must
 * include at least an `id` and a `label`.
 */
export function useMention<Data extends MentionExtensionAttributes = MentionExtensionAttributes>(
  props: UseMentionProps<Data>,
): UseMentionReturn<Data> {
  const { items, ignoreMatchesOnEscape } = props;
  const [mention, setMention] = useState<MentionState | null>(null);
  const helpers = useHelpers();

  const onDismiss = useCallback(() => {
    if (!mention) {
      return false;
    }

    const { range, name } = mention;

    // TODO Revisit to see if the following is too extreme
    if (ignoreMatchesOnEscape) {
      // Ignore the current mention so that it doesn't show again for this
      // matching area
      helpers.getSuggestMethods().addIgnored({ from: range.from, name, specific: true });
    }

    // Remove the matches.
    setMention(null);

    return true;
  }, [helpers, ignoreMatchesOnEscape, mention]);

  const onSubmit = useCallback(() => {
    if (!mention) {
      // When there is no state, defer to the next keybinding.
      return false;
    }

    const { index, command } = mention;

    const item = items[index];

    if (!item) {
      // Return since there's nothing that the enter key press can do.
      return false;
    }

    // Call the command with the item (including all the provided attributes which it includes).
    command(item);

    return true;
  }, [items, mention]);

  useMentionChangeHandler(props, setMention, mention?.index);
  const menu = useMenuNavigation<Data>({ items, isOpen: !!mention, onDismiss, onSubmit });

  return useMemo(() => ({ mention, menu }), [menu, mention]);
}

export interface UseMentionProps<
  Data extends MentionExtensionAttributes = MentionExtensionAttributes
> {
  /**
   * The list of data from which an index can be calculated. Must include at
   * least an `id` and a `label`.
   */
  items: Data[];

  /**
   * This method is called when a user induced exit happens before a mention has
   * been created. It receives the state, and gives the consumer of this hook
   * the opportunity to manually create their own mention
   *
   * Leave this undefined to ignore exits.
   *
   * To enable automatic exit handling. The following will automatically set the
   * id to be the query and the label to be the full matching text. Extra attrs
   * like `href` can be added by you to the attrs object parameter.
   *
   * ```ts
   * const mentionState = useMention({ items, onExit(_, command) => command(), });
   * ```
   */
  onExit?: UseMentionExitHandler<Data>;

  /**
   * Whether matches should be permanently ignored when the user presses escape.
   *
   * @default true
   */
  ignoreMatchesOnEscape?: boolean;
}

export type UseMentionExitHandler<
  Data extends MentionExtensionAttributes = MentionExtensionAttributes
> = (props: OnExitProps<Data>, command: (attrs?: Partial<Data>) => void) => void;

type OnExitProps<Data extends MentionExtensionAttributes = MentionExtensionAttributes> = Replace<
  Omit<MentionState<Data>, 'command'>,
  { reason: ExitReason }
>;