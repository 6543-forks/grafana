import React from 'react';
import { of } from 'rxjs';

import { serializeStateToUrlParam } from '@grafana/data';
import { config } from '@grafana/runtime';

import { silenceConsoleOutput } from '../../../../test/core/utils/silenceConsoleOutput';
import { ExploreId } from '../../../types';

import {
  assertDataSourceFilterVisibility,
  assertQueryHistory,
  assertQueryHistoryExists,
  assertQueryHistoryIsStarred,
  assertQueryHistoryTabIsSelected,
} from './helper/assert';
import {
  closeQueryHistory,
  deleteQueryHistory,
  inputQuery,
  openQueryHistory,
  runQuery,
  selectOnlyActiveDataSource,
  selectStarredTabFirst,
  starQueryHistory,
  switchToQueryHistoryTab,
} from './helper/interactions';
import { makeLogsQueryResponse } from './helper/query';
import { setupExplore, setupLocalStorageRichHistory, tearDown, waitForExplore } from './helper/setup';

const fetchMock = jest.fn();
const postMock = jest.fn();
const getMock = jest.fn();
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => ({ fetch: fetchMock, post: postMock, get: getMock }),
}));

jest.mock('react-virtualized-auto-sizer', () => {
  return {
    __esModule: true,
    default(props: any) {
      return <div>{props.children({ width: 1000 })}</div>;
    },
  };
});

describe('Explore: Query History', () => {
  const USER_INPUT = 'my query';
  const RAW_QUERY = `{"expr":"${USER_INPUT}"}`;

  silenceConsoleOutput();

  afterEach(() => {
    config.queryHistoryEnabled = false;
    fetchMock.mockClear();
    postMock.mockClear();
    getMock.mockClear();
    tearDown();
  });

  it('adds new query history items after the query is run.', async () => {
    // when Explore is opened
    const { datasources, unmount } = setupExplore();
    (datasources.loki.query as jest.Mock).mockReturnValueOnce(makeLogsQueryResponse());
    await waitForExplore();

    // and a user runs a query and opens query history
    await inputQuery(USER_INPUT);
    await runQuery();
    await openQueryHistory();

    // the query that was run is in query history
    await assertQueryHistoryExists(RAW_QUERY);

    // when Explore is opened again
    unmount();
    setupExplore({ clearLocalStorage: false });
    await waitForExplore();

    // previously added query is in query history
    await openQueryHistory();
    await assertQueryHistoryExists(RAW_QUERY);
  });

  it('adds recently added query if the query history panel is already open', async () => {
    const urlParams = {
      left: serializeStateToUrlParam({
        datasource: 'loki',
        queries: [{ refId: 'A', expr: 'query #1' }],
        range: { from: 'now-1h', to: 'now' },
      }),
    };

    const { datasources } = setupExplore({ urlParams });
    (datasources.loki.query as jest.Mock).mockReturnValueOnce(makeLogsQueryResponse());
    await waitForExplore();
    await openQueryHistory();

    await inputQuery('query #2');
    await runQuery();
    await assertQueryHistory(['{"expr":"query #2"}', '{"expr":"query #1"}']);
  });

  /**
   * TODO: #47635 check why this test times out
   */
  it.skip('updates the state in both Explore panes', async () => {
    const urlParams = {
      left: serializeStateToUrlParam({
        datasource: 'loki',
        queries: [{ refId: 'A', expr: 'query #1' }],
        range: { from: 'now-1h', to: 'now' },
      }),
      right: serializeStateToUrlParam({
        datasource: 'loki',
        queries: [{ refId: 'A', expr: 'query #2' }],
        range: { from: 'now-1h', to: 'now' },
      }),
    };

    const { datasources } = setupExplore({ urlParams });
    (datasources.loki.query as jest.Mock).mockReturnValue(makeLogsQueryResponse());
    await waitForExplore();
    await waitForExplore(ExploreId.right);

    // queries in history
    await openQueryHistory(ExploreId.left);
    await assertQueryHistory(['{"expr":"query #2"}', '{"expr":"query #1"}'], ExploreId.left);
    await openQueryHistory(ExploreId.right);
    await assertQueryHistory(['{"expr":"query #2"}', '{"expr":"query #1"}'], ExploreId.right);

    // star one one query
    starQueryHistory(1, ExploreId.left);
    await assertQueryHistoryIsStarred([false, true], ExploreId.left);
    await assertQueryHistoryIsStarred([false, true], ExploreId.right);

    deleteQueryHistory(0, ExploreId.left);
    await assertQueryHistory(['{"expr":"query #1"}'], ExploreId.left);
    await assertQueryHistory(['{"expr":"query #1"}'], ExploreId.right);
  });

  it('updates query history settings', async () => {
    // open settings page
    setupExplore();
    await waitForExplore();
    await openQueryHistory();

    // assert default values
    assertQueryHistoryTabIsSelected('Query history');
    assertDataSourceFilterVisibility(true);
    await switchToQueryHistoryTab('Settings');

    // change settings
    await selectStarredTabFirst();
    await selectOnlyActiveDataSource();
    await closeQueryHistory();
    await openQueryHistory();

    // assert new settings
    assertQueryHistoryTabIsSelected('Starred');
    assertDataSourceFilterVisibility(false);
  });

  describe('local storage migration', () => {
    it('does not migrate if query history is not enabled', async () => {
      config.queryHistoryEnabled = false;
      const { datasources } = setupExplore();
      setupLocalStorageRichHistory('loki');
      (datasources.loki.query as jest.Mock).mockReturnValueOnce(makeLogsQueryResponse());
      getMock.mockReturnValue({ result: { queryHistory: [] } });
      await waitForExplore();

      await openQueryHistory();
      expect(postMock).not.toBeCalledWith('/api/query-history/migrate', { queries: [] });
    });

    it('migrates query history from local storage', async () => {
      config.queryHistoryEnabled = true;
      const { datasources } = setupExplore();
      setupLocalStorageRichHistory('loki');
      (datasources.loki.query as jest.Mock).mockReturnValueOnce(makeLogsQueryResponse());
      fetchMock.mockReturnValue(of({ data: { result: { queryHistory: [] } } }));
      await waitForExplore();

      await openQueryHistory();
      expect(fetchMock).toBeCalledWith(
        expect.objectContaining({
          url: expect.stringMatching('/api/query-history/migrate'),
          data: { queries: [expect.objectContaining({ datasourceUid: 'loki' })] },
        })
      );
      fetchMock.mockReset();
      fetchMock.mockReturnValue(of({ data: { result: { queryHistory: [] } } }));

      await closeQueryHistory();
      await openQueryHistory();
      expect(fetchMock).not.toBeCalledWith(
        expect.objectContaining({
          url: expect.stringMatching('/api/query-history/migrate'),
        })
      );
    });
  });
});
