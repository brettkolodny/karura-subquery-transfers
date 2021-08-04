import {
  SubstrateExtrinsic,
  SubstrateEvent,
  SubstrateBlock,
} from "@subql/types";
import { Extrinsic, Account, Transfer, Event } from "../types";

async function createAccount(address: string): Promise<string> {
  let accountRecord = await Account.get(address);
  if (!accountRecord) {
    accountRecord = new Account(address);
    await accountRecord.save();
  }

  return address;
}

export async function handleCurrencyDeposit(
  event: SubstrateEvent
): Promise<void> {
  if (event.event.section != "currencies" || event.event.method != "Deposited") {
    return;
  }

  const {
    event: {
      data: [currency_id, who, amount],
    },
  } = event;

  const currencyJson = JSON.parse(currency_id.toString());

  const depositRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  depositRecord.currencyId = currencyJson.token;
  depositRecord.amount = amount.toString();
  depositRecord.toId = await createAccount(who.toString());
  depositRecord.txHash = event.extrinsic.extrinsic.hash.toString();

  await depositRecord.save();
}

export async function handleCurrencyTransfer(
  event: SubstrateEvent
): Promise<void> {
  if (event.event.section != "currencies" || event.event.method != "Transferred") {
    return;
  }

  const {
    event: {
      data: [currency_id, from, to, amount],
    },
  } = event;

  const currency_json = JSON.parse(currency_id.toString());

  const transferRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  transferRecord.currencyId = currency_json.token;
  transferRecord.amount = amount.toString();
  transferRecord.toId = await createAccount(to.toString());
  transferRecord.fromId = await createAccount(from.toString());
  transferRecord.txHash = event.extrinsic.extrinsic.hash.toString();

  await transferRecord.save();
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  const eventRecord = new Event(`${event.block.block.header.number.toNumber()}-${event.idx}`);

  await handleCurrencyDeposit(event);
  await handleCurrencyTransfer(event);

  logger.info(`
  event: ${event.event.section}.${event.event.method}
  name: ${event.event.meta.name}
  args: ${event.event.meta.args}
  data: ${event.event.data.toString()}\n
  `)

  eventRecord.method = event.event.method;
  eventRecord.section = event.event.section;
  eventRecord.txId = event.extrinsic ? event.extrinsic.extrinsic.hash.toString() : null;

  await eventRecord.save();
}

export async function handleCall(extrinsic: SubstrateExtrinsic): Promise<void> {
  const txRecord = new Extrinsic(
    `${extrinsic.extrinsic.hash.toString()}`
  );

  txRecord.senderId = await createAccount(
    extrinsic.extrinsic.signer.toString()
  );
  txRecord.section = extrinsic.extrinsic.method.section;
  txRecord.method = extrinsic.extrinsic.method.meta.name.toString();
  logger.info(`argsMeta: ${extrinsic.extrinsic.meta.args}`);
  txRecord.args = extrinsic.extrinsic.args.map((arg) => arg.toString());
  txRecord.argsNames = extrinsic.extrinsic.meta.args.map((arg) =>
    arg.name.toString()
  );
  txRecord.success = extrinsic.success;
  txRecord.txId = `${extrinsic.block.block.header.number}-${extrinsic.idx}`;

  await txRecord.save();
}
