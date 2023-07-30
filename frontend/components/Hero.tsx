import React, { useEffect, useState } from 'react'
import getPrizePool, { Item } from '../lib/getPrizePool'
import LoadingNumber from './LoadingNumber'

type HeroProps = {
  variant?: string
}

const Hero: React.FC<HeroProps> = ({ variant }) => {
  const [loading, setLoading] = useState(true)
  const [prizePool, setPrizePool] = useState<Item | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const prizePoolData = await getPrizePool()
      if (prizePoolData) {
        setPrizePool(prizePoolData)
      }
      setLoading(false)
    }

    fetchData()
  }, [])

  const backgroundImageUrl =
    variant === 'rewards' ? '/banner-rewards.svg' : '/banner-home.svg'
  const bottomImageUrl =
    variant === 'rewards' ? '/gold-pot.svg' : '/gold-chest.svg'
  const textColor = variant === 'rewards' ? 'text-white' : 'text-[#101828]'

  return (
    <div
      className="grid w-full grid-cols-1 overflow-hidden rounded-lg bg-cover bg-center md:max-h-[26rem] md:grid-cols-2"
      style={{ backgroundImage: `url('${backgroundImageUrl}')` }}
    >
      <div>
        <div className="flex flex-col items-center justify-center px-2 py-10">
          <img src="/pot-o-gold.svg" alt="pot-o-gold" />
          <h2
            className={`mt-[-0.75rem] text-base font-normal ${textColor} md:text-lg`}
          >
            Earn 1 raffle ticket for every 0.10 ETH bought or sold
          </h2>

          <div className="mt-11 flex w-[340px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-solid border-[#FFF06A] bg-gradient-to-b from-[#FFE179] to-[#FFB52E] px-10 py-4 text-black md:px-16">
            <div className="text-lg font-normal md:text-xl">Prize Pool</div>
            <div className="w-full text-xl md:w-auto md:text-2xl">
              {loading ? (
                <div className="text-xl md:text-2xl">
                  <LoadingNumber
                    loading={loading}
                    value={prizePool?.currentPotSize?.slice(0, 4) || '0.00'}
                  />
                  <span className="text-lg md:text-xl"> ETH</span> /{' '}
                  <span className="text-purple-600">
                    <LoadingNumber
                      loading={loading}
                      value={prizePool?.potLimit || '0.0'}
                    />{' '}
                    <span className="text-lg md:text-xl">ETH</span>
                  </span>
                </div>
              ) : (
                <div className="text-xl md:text-2xl">
                  {prizePool?.currentPotSize?.slice(0, 4)}{' '}
                  <span className="text-lg md:text-xl">ETH</span> /{' '}
                  <span className="text-purple-600">
                    {prizePool?.potLimit?.slice(0, 4)}{' '}
                    <span className="text-lg md:text-xl">ETH</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden items-end md:flex">
        <img
          src={bottomImageUrl}
          alt="rewards-image"
          className="h-[30rem] object-fill object-bottom"
        />
      </div>
    </div>
  )
}

export default Hero
