import { SubstrateExtrinsic, SubstrateEvent } from "@subql/types";
import { Codec } from "@polkadot/types/types";
import { Extrinsic, Account, Transfer, Event } from "../types";

async function createAccount(address: string): Promise<string> {
  let accountRecord = await Account.get(address);
  if (!accountRecord) {
    accountRecord = new Account(address);
    await accountRecord.save();
  }

  return address;
}

function jsonToTokenName(currencyJson: any): string {
  if (currencyJson.token) {
    return currencyJson.token;
  } else if (currencyJson["foreignAsset"] != undefined) {
    if (currencyJson.foreignAsset === 0) {
      return "RMRK";
    }
  } else if (currencyJson.dexShare) {
    return `${jsonToTokenName(currencyJson.dexShare[0])}<>${jsonToTokenName(
      currencyJson.dexShare[1]
    )} LP`;
  }

  logger.info(`No Name: ${JSON.stringify(currencyJson)}`);
  return "??";
}

function getToken(currencyId: Codec): string {
  const currencyJson = JSON.parse(currencyId.toString());

  return jsonToTokenName(currencyJson);
}

export async function handleCurrencyDeposit(
  event: SubstrateEvent
): Promise<void> {
  if (
    event.event.section != "currencies" ||
    event.event.method != "Deposited"
  ) {
    return;
  }

  const {
    event: {
      data: [currency_id, who, amount],
    },
  } = event;

  const depositRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  depositRecord.currencyId = getToken(currency_id);
  depositRecord.amount = amount.toString();
  depositRecord.toId = await createAccount(who.toString());
  depositRecord.txHash = event.extrinsic.extrinsic.hash.toString();
  depositRecord.timestamp = BigInt(event.extrinsic.block.timestamp.getTime());

  await depositRecord.save();
}

export async function handleCurrencyTransfer(
  event: SubstrateEvent
): Promise<void> {
  if (
    event.event.section != "currencies" ||
    event.event.method != "Transferred"
  ) {
    return;
  }

  const {
    event: {
      data: [currency_id, from, to, amount],
    },
  } = event;

  const transferRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  transferRecord.currencyId = getToken(currency_id);
  transferRecord.amount = amount.toString();
  transferRecord.toId = await createAccount(to.toString());
  transferRecord.fromId = await createAccount(from.toString());
  transferRecord.txHash = event.extrinsic.extrinsic.hash.toString();
  transferRecord.timestamp = BigInt(event.extrinsic.block.timestamp.getTime());

  await transferRecord.save();
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  if (!event.phase.isApplyExtrinsic) return;

  const eventRecord = new Event(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );

  await handleCurrencyDeposit(event);
  await handleCurrencyTransfer(event);

  eventRecord.method = event.event.method;
  eventRecord.section = event.event.section;
  eventRecord.txId = event.extrinsic
    ? event.extrinsic.extrinsic.hash.toString()
    : null;

  await eventRecord.save();
}

export async function handleBalanceTransfer(
  extrinsic: SubstrateExtrinsic
): Promise<void> {
  if (extrinsic.extrinsic.method.section != "balances") return;
  if (!extrinsic.success) return;

  let index = 0;
  const transferEvent = extrinsic.events.find((e, i) => {
    if (e.event.section === "balances" && e.event.method === "Transfer") {
      index = i;
      return true;
    } else {
      return false;
    }
  });

  if (transferEvent == undefined) return;

  const {
    event: {
      data: [from, to, value],
    },
  } = transferEvent;

  const transferRecord = new Transfer(
    `${extrinsic.block.block.header.number.toNumber()}-${index}`
  );

  transferRecord.amount = value.toString();
  transferRecord.currencyId = "KAR";
  transferRecord.toId = await createAccount(to.toString());
  transferRecord.fromId = await createAccount(from.toString());
  transferRecord.txHash = extrinsic.extrinsic.hash.toString();
  transferRecord.timestamp = BigInt(extrinsic.block.timestamp.getTime());

  await transferRecord.save();
}

export async function handleCall(extrinsic: SubstrateExtrinsic): Promise<void> {
  const txRecord = new Extrinsic(`${extrinsic.extrinsic.hash.toString()}`);

  await handleBalanceTransfer(extrinsic);

  txRecord.senderId = await createAccount(
    extrinsic.extrinsic.signer.toString()
  );
  txRecord.section = extrinsic.extrinsic.method.section;
  txRecord.method = extrinsic.extrinsic.method.meta.name.toString();
  txRecord.args = extrinsic.extrinsic.args.map((arg) => arg.toString());
  txRecord.argsNames = extrinsic.extrinsic.meta.args.map((arg) =>
    arg.name.toString()
  );
  txRecord.success = extrinsic.success;
  txRecord.txId = `${extrinsic.block.block.header.number}-${extrinsic.idx}`;
  txRecord.timestamp = BigInt(extrinsic.block.timestamp.getTime());

  await txRecord.save();
}
