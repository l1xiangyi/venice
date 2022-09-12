import * as slonikMigrator from '@slonik/migrator'
import * as slonik from 'slonik'

import {implementProxyFn} from '@ledger-sync/util'

import {$slonik, $slonikMigrator} from './makePostgresClient'

implementProxyFn($slonik, () => slonik)
implementProxyFn($slonikMigrator, () => slonikMigrator)
